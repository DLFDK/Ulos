import { stat, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import Zip from "adm-zip";
import { LambdaClient, ResourceConflictException, UpdateFunctionCodeCommand } from "@aws-sdk/client-lambda";
import type { AwsCredentialIdentity } from "@aws-sdk/types";

export function getRelativePosixPath(targetFolder: string, targetFile: string): string {
    return path.relative(targetFolder, targetFile).split(path.sep).join(path.posix.sep);
}

export async function getTargets(target: string): Promise<{ targetFolder: string; targetFile: string }> {
    const targetStat = await stat(target);

    if (targetStat.isFile()) {
        return { targetFolder: path.dirname(target), targetFile: path.basename(target) };
    }

    if (targetStat.isDirectory()) {
        return { targetFolder: target, targetFile: "" };
    }

    throw new Error("Target is not a file or directory");
}

export async function primeQueue(targetFolder: string, targetFile?: string): Promise<Map<string, string>> {
    const intialFileQueue = new Map<string, string>();
    if (targetFile) {
        intialFileQueue.set(targetFile, "add");
        return intialFileQueue;
    }

    const directories = [targetFolder];
    for (const directory of directories) {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                directories.push(path.format({ dir: entry.path, base: entry.name }));
            } else {
                const formattedPath = path
                    .relative(targetFolder, path.posix.format({ dir: entry.path, base: entry.name }))
                    .split(path.sep)
                    .join(path.posix.sep);
                intialFileQueue.set(formattedPath, "add");
            }
        }
    }
    return intialFileQueue;
}

export class Archiver {
    #zip = new Zip();
    #fileList = new Map<string, string>();

    async archive(fileQueue: Map<string, string>, targetFolder: string): Promise<Buffer> {
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
                        buffer = await readFile(path.format({ dir: targetFolder, base: filename }));
                        attempts++;
                    }

                    const hash = createHash("sha256").update(buffer).digest("base64");

                    if (this.#fileList.get(filename) === hash) break;

                    this.#fileList.set(filename, hash);

                    if (this.#zip.getEntry(filename)) {
                        this.#zip.updateFile(filename, buffer);
                        break;
                    }

                    this.#zip.addFile(filename, buffer);
                    break;
                }
                case "unlink": {
                    this.#fileList.delete(filename);
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
