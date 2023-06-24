#!/usr/bin/env node
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "url";
import path from "path";
import chokidar from "chokidar";
import { getArguments, getCredentials, getTargetFolder, Painter, getRelativePosixPath, formatCodeSize } from "./main.js";
import type { MessageFromWorker, MessageToWorker, WorkerData } from "../shared.types.d.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const painter = new Painter();
painter.paint("start");

const argsResult = await getArguments(process.argv);
if (typeof argsResult === "string") {
    painter.paint("error", argsResult);
    process.exit(1);
}

const { lambda, target, region, profile } = argsResult;

const {targetFolder, errorMessage} = await getTargetFolder(target);
if (errorMessage) {
    painter.paint("error", errorMessage);
    process.exit(1);
}

const credentialsResult = await getCredentials(profile);
if (typeof credentialsResult === "string") {
    painter.paint("error", credentialsResult);
    process.exit(1);
}

const workerData: WorkerData = { lambda, targetFolder: targetFolder, region, credentials: credentialsResult };

const worker = new Worker(__dirname + "/../worker/index.js", { workerData: workerData });

const postMessage = (message: MessageToWorker) => worker.postMessage(message);

chokidar.watch(target).on("all", (event, eventPath) => {
    if (event === "add" || event === "change" || event === "unlink") postMessage({ filePath: getRelativePosixPath(targetFolder, eventPath), fileEvent: event });
});

worker.on("message", (message: MessageFromWorker) => {
    switch (message.status) {
        case "uploading":
            painter.paint("uploading");
            break;
        case "success":
            painter.paint("watching", formatCodeSize(message.codeSize ?? 0));
            break;
    }
});

painter.paint("initial");
