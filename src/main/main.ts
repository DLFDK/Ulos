import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import type { AwsCredentialIdentity } from "@aws-sdk/types";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import chalk from "chalk";
import ora from "ora";
import { Stats } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

export async function getCredentials(profile?: string): Promise<string | AwsCredentialIdentity> {
    try {
        if (profile) return await fromNodeProviderChain({ profile })();
        return await fromNodeProviderChain()();
    } catch (error) {
        if (error instanceof Error) {
            return profile ? error.message : error.message + "\n  You can specify a profile using the --profile flag";
        }
        throw error;
    }
}

export async function getArguments(argv: string[]): Promise<string | { lambda: string; target: string; region: string; profile?: string }> {
    const { lambda, target, region, profile } = await yargs(hideBin(argv)).argv;

    if (!lambda || !isString(lambda)) {
        return "No valid lambda provided - please provide the name of a lambda function using the --lambda flag";
    }

    if (!target || !isString(target)) {
        return "No valid target provided - please provide a target file or folder using the --target flag";
    }

    if (!region || !isString(region)) {
        return "No valid region provided - please provide a region using the --region flag";
    }

    if (!isUndefined(profile) && !isString(profile)) {
        return "No valid profile provided - please provide a profile using the --profile flag";
    }

    return { lambda, target, region, profile };
}

export function isString(value: unknown): value is string {
    return typeof value === "string";
}

export function isUndefined(input: unknown): input is undefined {
    return typeof input === "undefined";
}

export async function getTargetFolder(target: string): Promise<{ targetFolder: string; errorMessage: string }> {
    let targetStat: Stats;
    try {
        targetStat = await stat(target);
    } catch (error) {
        if (error instanceof Error) {
            return { targetFolder: "", errorMessage: "Target not found: " + error.message };
        }
        throw error;
    }

    if (targetStat.isFile()) {
        return { targetFolder: path.dirname(target), errorMessage: "" };
    }

    if (targetStat.isDirectory()) {
        return { targetFolder: target, errorMessage: "" };
    }

    return { targetFolder: "", errorMessage: "Target is not a file or directory" };
}

export function getRelativePosixPath(targetFolder: string, targetFile: string): string {
    return path.relative(targetFolder, targetFile).split(path.sep).join(path.posix.sep);
}

export function formatCodeSize(codeSize: number): string {
    if (codeSize < 1024) return `${codeSize} B`;
    const kilobytes = codeSize / 1024;
    if (kilobytes < 1024) return `${kilobytes.toFixed(0)} KB`;
    const megabytes = kilobytes / 1024;
    return `${megabytes.toFixed(1)} MB`;
}

export class Painter {
    #prevState = "";
    #spinner = ora();

    paint(state: "start" | "initial" | "uploading" | "watching" | "error", message?: string) {
        switch (state) {
            case "start":
                this.#clearScreen();
                this.#paintTitle();
                this.#spinner.start();
                this.#spinner.text = "Setting up";
                break;
            case "initial":
                this.#spinner.text = "Preparing inital deployment package";
                break;
            case "uploading":
                if (this.#prevState === "initial") {
                    this.#spinner.text = "Uploading deployment package";
                } else if (this.#prevState === "watching") {
                    this.#spinner.stop();
                    this.#clearScreen();
                    this.#paintTitle();
                    this.#spinner = ora().start("Uploading deployment package");
                }
                // ... else we're uploading twice in a row and there's no need to update the text
                break;
            case "watching":
                const date = new Date();
                const time = `${date.getHours() < 10 ? "0" : ""}${date.getHours()}:${date.getMinutes() < 10 ? "0" : ""}${date.getMinutes()}:${date.getSeconds() < 10 ? "0" : ""}${date.getSeconds()}`;
                this.#spinner.text = `Deployment package uploaded (${message}) [${time}]`;
                this.#spinner.succeed();
                this.#spinner.stop();
                this.#spinner = ora({ interval: 400 }).start("Watching for files changes");
                break;
            case "error":
                this.#spinner.fail(message);
                break;
        }

        this.#prevState = state;
    }

    #clearScreen() {
        process.stdout.write("\x1Bc");
    }

    #paintTitle() {
        process.stdout.write(chalk.bold("Ulos"));
        process.stdout.write(` - ${chalk.bold("u")}pload ${chalk.bold("l")}ambda ${chalk.bold("o")}n ${chalk.bold("s")}ave  \n\n`);
    }
}
