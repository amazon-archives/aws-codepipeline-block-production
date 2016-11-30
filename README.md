# AWS CodePipeline Block Production

The resources in this repository will help you setup required AWS resources for blocking prod deployments until the canary deployment validation succeeds.

## Prerequisites

1. Create an AWS CodeCommit repository with any name of your preference using AWS console or CLI. This document assumes that the name you chose is `aws-codepipeline-block-production`.
2. Clone the content of this repository to AWS CodeCommit repository created in the above step. See this [article](http://docs.aws.amazon.com/codecommit/latest/userguide/how-to-migrate-repository.html) for details on cloning a GitHub repository to AWS CodeCommit.
3. Create an Amazon EC2 key pair if you don't have one already.

## Steps
Run following steps in the local workspace where GitHub repository was cloned:

1. If you chose a different AWS CodeCommit repository name, replace `ParameterValue` in `setup-block-production-resources-stack-parameters.json` file with the name you chose.
2. Update `block-production-demo-resources-parameters.json` file to replace parameter values:
    * `DemoResourcesCodeCommitRepo`: Update if you chose a different repository name in the step 1 in Prerequisites section.
    * `DemoResourcesCodeCommitRepoBranch` : Default branch is `master`. Update if the branch name is different.
    * `CanaryApprovalConfiguration` : Canary approval configuration in JSON format which specifies timeout in minutes and number of metrics required before deployment is considered successful.
        * `timeoutMinutes` : The time in minutes to wait before considering Approval to be timed out.
        * `metricsRequired` : Minimum number of metrics required from canary deploy action before the canary approval is successfully completed.
    * `KeyName`: Amazon EC2 key pair name.
    * `AppName`: Default is `BlockProduction`. Some of the AWS resources will be prefixed with this name.
    * `YourIP` : IP address to connect to SSH from. Check http://checkip.amazonaws.com/ to find yours.
3. Create a new CloudFormation stack using AWS CloudFormation template `setup-block-production-resources-stack.yml` 
and parameter file `setup-block-production-resources-stack-parameters.json`. See this [article](https://aws.amazon.com/blogs/devops/passing-parameters-to-cloudformation-stacks-with-the-aws-cli-and-powershell/) for the details on how to pass parameters file using CLI.

    ```
    aws cloudformation create-stack --stack-name  SetupBlockProductionDemoResourcesStack --template-body file://<The path to local workspace>/aws-codepipeline-block-production/setup-block-production-resources-stack.yml  --capabilities CAPABILITY_IAM --parameters  file://<The path to local workspace>/aws-codepipeline-block-production/setup-block-production-resources-stack-parameters.json
    ```
4. Step 3 will create an AWS CodePipeline named `SetupBlockProductionDemoResources-Pipeline`. This pipeline will use AWS CloudFormation integration with AWS CodePipeline to publish AWS Lambda functions to Amazon S3 and create a new stack using template `block-production-demo-resources.yml` that contains actual AWS resources used in demo including a new AWS CodePipeline with the name prefixed by `AppName` specified above. 
5. Above step will set up following things:
    * A new AWS CodePipeline named `BlockProduction-Pipeline` with a stage that contains canary deploy, canary approval and prod deploy actions. Once canary deployment succeeds, canary approval action runs and sends a notification to Amazon SNS topic configured in Approval action.
    * An AWS Lambda function (`register-canary-approval.js`) is subscribed to this topic which registers this request in an Amazon DynamoDB table.
    * AWS Resources for running synthetic tests periodically including an Amazon CloudWatch alarm.
    * AWS Lambda function (`process-canary-approval.js`) that runs periodically and scans the table for open approval requests. If there are required number of metrics available and the synthetic tests alarm is OK then it approves the request using AWS CodePipeline API `PutApprovalResult` which allows the pipeline run to proceed to the next prod deploy action.

## Cleanup
When no longer required, please remember to delete the stacks using AWS CloudFormation console or CLI to avoid getting charged.

## License
This plugin is open sourced and licensed under Apache 2.0. See the LICENSE file for more information. 
