import type { AwsCredentialIdentity } from "@aws-sdk/types";

export interface MessageToWorker {
    event: string;
    eventPath: string;
}

export interface MessageFromWorker {
    status: "uploading" | "success",
    codeSize?: number;
}

export interface WorkerData {
    lambda: string;
    target: string;
    region: string;
    credentials: AwsCredentialIdentity;
}