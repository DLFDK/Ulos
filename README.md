# Ulos
**U**pload **L**ambda **O**n **S**ave - it's that simple, really.

Ulos is a minimal Nodejs library that watches a file (or folder of files and subfolders) for changes and uploads a new deployment package to AWS Lambda when a change is registered. Files and folders are watched using [Chokidar](https://github.com/paulmillr/chokidar)

## Getting started

Ulos is invoked using `npx` and a series of flags.

```
npx ulos --target "path/to/file/or/folder" --lambda "myfunction" --region "myregion" --profile "myprofile" 
```

**`--target`**

Required. A relative or absolute path to the file or folder that will be watched. All files and files within any level of subfolder will be watched and included in the deployment package.

**`--lambda`**

Required. The name of the Lambda function to be updated upon file changes. Note that any existing deployment package will be overwritten upon running Ulos.

**`--region`**

Required. The region in which the Lambda function resides.

**`--profile`**

Optional. Ulos will attempt to fetch default credentials from the system using the AWS SDK V3 [@aws-sdk/credential-providers](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_credential_providers.html). If you would like to provide a different profile or you have no default profile set, you can provide an explicit profile here.