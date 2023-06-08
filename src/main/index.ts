#!/usr/bin/env node
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "url";
import path from "path";
import chokidar from "chokidar";
import { getArguments, getCredentials, Painter } from "./main.js";
import type { MessageFromWorker, MessageToWorker, WorkerData } from "../shared.types.d.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const painter = new Painter();
painter.paint("start");

const args = await getArguments(process.argv);
if (typeof args === "string") {
    painter.paint("error", args);
    process.exit(1);
}

const { lambda, target, region, profile } = args;

const credentials = await getCredentials(profile);
if (typeof credentials === "string") {
    painter.paint("error", credentials);
    process.exit(1);
}

painter.paint("initial");

const workerData: WorkerData = { lambda, target, region, credentials };

const worker = new Worker(__dirname + "/../worker/index.js", { workerData: workerData });

chokidar.watch(target, { ignoreInitial: true }).on("all", (event, eventPath) => {
    const message: MessageToWorker = { event, eventPath };
    if (event === "add" || event === "change" || event === "unlink") worker.postMessage(message);
});

worker.on("message", (message: MessageFromWorker) => {
    switch (message) {
        case "uploading":
            painter.paint("uploading");
            break;
        case "uploaded":
            painter.paint("ready");
            break;
    }
});
