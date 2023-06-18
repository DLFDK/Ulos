import { parentPort, workerData } from "worker_threads";
import { getTargets, primeQueue, Archiver, Uploader, getRelativePosixPath } from "./worker.js";
import type { MessageFromWorker, MessageToWorker, WorkerData } from "../shared.types.d.ts";

if (!parentPort) throw new Error("No parent port");

const postMessage = (message: MessageFromWorker) => parentPort!.postMessage(message);

const { lambda, target, region, credentials } = workerData as WorkerData;

const { targetFolder, targetFile } = await getTargets(target);

const archiver = new Archiver();
const uploader = new Uploader(lambda, region, credentials);

const fileQueue = await primeQueue(targetFolder, targetFile);

let isProcessing: boolean;

await processQueue();

parentPort.on("message", (message: MessageToWorker) => {
    fileQueue.set(getRelativePosixPath(targetFolder, message.eventPath), message.event);
    
    if (!isProcessing) {
        isProcessing = true;
        processQueue();
    }
});

async function processQueue() {
    const buffer = await archiver.archive(fileQueue, targetFolder);

    if(!uploader.hasChanged(buffer)) {
        isProcessing = false;
        return;
    }

    parentPort!.postMessage({status: "uploading"});

    const result = await uploader.upload(buffer);

    if (!result || fileQueue.size) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        processQueue();
    } else {
        postMessage({status: "success", codeSize: result})
        isProcessing = false;
    }
}
