import type { AwsCredentialIdentity } from "@aws-sdk/types";

export interface MessageToWorker {
    event: string;
    eventPath: string;
}

export type MessageFromWorker = "uploaded" | "busy" | "nochange" | "ready" | "uploading";

export interface WorkerData {
    lambda: string;
    target: string;
    region: string;
    credentials: AwsCredentialIdentity;
}