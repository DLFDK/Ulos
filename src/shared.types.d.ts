import type { AwsCredentialIdentity } from "@aws-sdk/types";

export interface MessageToWorker {
    filePath: string;
    fileEvent: "change" | "add" | "unlink";
}

export interface MessageFromWorker {
    status: "uploading" | "success",
    codeSize?: number;
}

export interface WorkerData {
    lambda: string;
    targetFolder: string;
    region: string;
    credentials: AwsCredentialIdentity;
}