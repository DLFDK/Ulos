import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import Zip from "adm-zip";
import { LambdaClient, ResourceConflictException, UpdateFunctionCodeCommand } from "@aws-sdk/client-lambda";
import type { AwsCredentialIdentity } from "@aws-sdk/types";
import { MessageFromWorker } from "../shared.types.js";

type FileQueue = Map<string, "add" | "change" | "unlink">;

export class Archiver {
    #targetFolder: string;
    #zip = new Zip();
    #hashes = new Map<string, string>();

    constructor(targetFolder: string) {
        this.#targetFolder = targetFolder;
    }

    async archive(fileQueue: FileQueue): Promise<Buffer> {
        for (const [filename, event] of fileQueue) {
            fileQueue.delete(filename);
            switch (event) {
                case "add":
                case "change": {
                    let buffer = Buffer.alloc(0);
                    let attempts = 0;

                    // An empty buffer can be the result of a file being written to. After three attempts, we assume the file is actually empty.
                    while (!buffer.byteLength) {
                        if (attempts > 3) break;
                        buffer = await readFile(path.format({ dir: this.#targetFolder, base: filename }));
                        attempts++;
                    }

                    const hash = createHash("sha256").update(buffer).digest("base64");

                    if (this.#hashes.get(filename) === hash) break;

                    this.#hashes.set(filename, hash);

                    if (this.#zip.getEntry(filename)) {
                        this.#zip.updateFile(filename, buffer);
                        break;
                    }

                    this.#zip.addFile(filename, buffer);
                    break;
                }
                case "unlink": {
                    this.#hashes.delete(filename);
                    this.#zip.deleteFile(filename);
                }
            }
        }
        return this.#zip.toBuffer();
    }
}

export class Uploader {
    #lambda: string;
    #client: LambdaClient;
    #hashOfUploaded = "";

    constructor(lambda: string, region: string, awsCredentialIdentity: AwsCredentialIdentity) {
        this.#client = new LambdaClient({
            credentials: awsCredentialIdentity,
            region: region,
        });
        this.#lambda = lambda;
    }

    async upload(buffer: Buffer): Promise<number | undefined> {
        try {
            const { CodeSha256, CodeSize } = await this.#client.send(new UpdateFunctionCodeCommand({ FunctionName: this.#lambda, ZipFile: buffer }));
            this.#hashOfUploaded = CodeSha256 ?? "";
            return CodeSize;
        } catch (error) {
            if (error instanceof ResourceConflictException && error.$metadata.httpStatusCode === 409) return;
            throw error;
        }
    }

    hasChanged(buffer: Buffer): boolean {
        const hash = createHash("sha256").update(buffer).digest("base64");
        return hash !== this.#hashOfUploaded;
    }
}

export class QueueManager {
    #archiver: Archiver;
    #uploader: Uploader;
    #postMessage: (message: MessageFromWorker) => void;
    #delayConfig: {
        add: number;
        change: number;
        unlink: number;
    };
    #isProcessing = false;
    #fileQueue: FileQueue = new Map();
    #timeoutId: NodeJS.Timeout | undefined;
    #delay = 0;

    constructor(archiver: Archiver, uploader: Uploader, postMessage: (message: MessageFromWorker) => void, delayConfig: { add: number; change: number; unlink: number }) {
        this.#archiver = archiver;
        this.#uploader = uploader;
        this.#postMessage = postMessage;
        this.#delayConfig = delayConfig;
    }

    async add(filePath: string, fileEvent: "change" | "add" | "unlink") {
        this.#fileQueue.set(filePath, fileEvent);

        if (this.#isProcessing) return;

        const eventDelay = this.#delayConfig[fileEvent];
        this.#delay = eventDelay > this.#delay ? eventDelay : this.#delay;

        if (this.#timeoutId) clearTimeout(this.#timeoutId);
        this.#timeoutId = setTimeout(() => {
            this.#isProcessing = true;
            this.#processQueue();
        }, this.#delay);
    }

    async #processQueue() {
        const buffer = await this.#archiver.archive(this.#fileQueue);

        if (!this.#uploader.hasChanged(buffer)) {
            this.#isProcessing = false;
            return;
        }

        this.#postMessage({ status: "uploading" });

        const result = await this.#uploader.upload(buffer);

        if (!result || this.#fileQueue.size) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            this.#processQueue();
        } else {
            this.#postMessage({ status: "success", codeSize: result });
            this.#isProcessing = false;
            this.#delay = 0;
        }
    }
}
