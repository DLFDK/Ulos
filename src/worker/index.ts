import { parentPort, workerData } from "worker_threads";
import { Archiver, Uploader, QueueManager } from "./worker.js";
import type { MessageFromWorker, MessageToWorker, WorkerData } from "../shared.types.d.ts";

if (!parentPort) throw new Error("No parent port");

const delayConfig = {
    add: 1000,
    change: 0,
    unlink: 1000,
}

const postMessage = (message: MessageFromWorker) => parentPort!.postMessage(message);

const { lambda, targetFolder, region, credentials } = workerData as WorkerData;

const archiver = new Archiver(targetFolder);

const uploader = new Uploader(lambda, region, credentials);

const queueManager = new QueueManager(archiver, uploader, postMessage, delayConfig);

parentPort.on("message", (message: MessageToWorker) => {
    queueManager.add(message.filePath, message.fileEvent);
});
