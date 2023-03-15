import * as CDK from "aws-cdk-lib";
import * as IAM from "aws-cdk-lib/aws-iam";
import * as Lambda from "aws-cdk-lib/aws-lambda";
import * as NodeJSLambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as CustomResource from "aws-cdk-lib/custom-resources";
import { Construct } from 'constructs';

export interface StartMediaConnectFlowProps {

    readonly flowArn: string;

}

export class StartMediaConnectFlow extends CDK.CustomResource {

    private static providersByStackId: Record<string, CustomResource.Provider> = {};

    public constructor(scope: Construct, id: string, props: StartMediaConnectFlowProps) {
        super(scope, id, {
            serviceToken: StartMediaConnectFlow.getProvider(CDK.Stack.of(scope)).serviceToken,
            properties: props,
            resourceType: `Custom::StartMediaConnectFlow`,
        });
    }

    private static getProvider(stack: CDK.Stack): CustomResource.Provider {

        const existingProvider = StartMediaConnectFlow.providersByStackId[stack.stackId];

        if (existingProvider) {
            return existingProvider;
        }

        const lambda = new NodeJSLambda.NodejsFunction(stack, "startMediaConnectFlowCustomResourceFunction", {
            entry: './infra/custom-resources/StartMediaConnectFlowHandler.ts',
            handler: 'handler',
            runtime: Lambda.Runtime.NODEJS_16_X,
            timeout: CDK.Duration.minutes(5)
        });

        lambda.addToRolePolicy(new IAM.PolicyStatement({
            actions: [
                "mediaconnect:DescribeFlow",
                "mediaconnect:StartFlow",
                "mediaconnect:StopFlow",
            ],
            resources: [ "*" ],
        }));

        const newProvider = new CustomResource.Provider(stack, `StartMediaConnectFlowProvider`, {
            onEventHandler: lambda,
        });

        StartMediaConnectFlow.providersByStackId[stack.stackId] = newProvider;
        return newProvider;

    }

}
