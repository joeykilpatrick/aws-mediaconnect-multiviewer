import * as CDK from 'aws-cdk-lib';
import * as EC2 from 'aws-cdk-lib/aws-ec2';
import * as ECS from 'aws-cdk-lib/aws-ecs';
import * as IAM from 'aws-cdk-lib/aws-iam';
import * as MediaConnect from 'aws-cdk-lib/aws-mediaconnect';
import { IDependable } from "constructs";
import {transformAndValidateSync} from "class-transformer-validator";

import {PublicVpc} from "./vpc";
import {Environment} from "./environment";
import {enumMap} from "./helpers";
import {StartMediaConnectFlow} from "./custom-resources/StartMediaConnectFlow";

const environment: Environment = transformAndValidateSync(Environment, process.env, {validator: {validationError: {target: false}}});

const stackNameKebab: string = 'aws-mediaconnect-multiviewer';

const app = new CDK.App();
const stack = new CDK.Stack(app, stackNameKebab, {
    env: {
        account: environment.ACCOUNT_ID,
        region: environment.REGION,
    },
});

enum VideoStream {
    RED = 'red',
    YELLOW = 'yellow',
    GREEN = 'green',
    BLUE = 'blue',
}

const multiviewerVpc = new PublicVpc(stack, 'multiviewerVpc', environment);

function createFlow(color: VideoStream): {flow: MediaConnect.CfnFlow, output: MediaConnect.CfnFlowOutput} {

    const flowName: string = `${stackNameKebab}-${color}`;

    const flow = new MediaConnect.CfnFlow(stack, `${color}Flow`, {
        name: flowName,
        source: {
            name: `${flowName}-source`,
            description: `${flowName}-source`,
            ingestPort: 3000,
            protocol: "srt-listener",
            whitelistCidr: "0.0.0.0/0",
        },
    });

    const output = new MediaConnect.CfnFlowOutput(stack, `${color}FlowOutput`, {
        flowArn: flow.attrFlowArn,
        port: 3001,
        cidrAllowList: [
            '0.0.0.0/0',
        ],
        protocol: 'srt-listener',
    });

    return {
        flow,
        output,
    };

}

const flows = enumMap(VideoStream, createFlow);

const flowStart = enumMap(VideoStream, (color) => {
    return new StartMediaConnectFlow(stack, `${color}SourceFlowStart`, {
        flowArn: flows[color].flow.attrFlowArn
    });
})

const multiviewerFlowName = `${stackNameKebab}-multiviewer`;
const multiviewerFlow = new MediaConnect.CfnFlow(stack, 'multiviewerFlow', {
    name: multiviewerFlowName,
    source: {
        name: `${multiviewerFlowName}-source`,
        description: `${multiviewerFlowName}-source`,
        ingestPort: 3000,
        protocol: "srt-listener",
        whitelistCidr: "0.0.0.0/0",
    },
});
const multiviewerFlowStart = new StartMediaConnectFlow(stack, `multiviewerFlowStart`, {
    flowArn: multiviewerFlow.attrFlowArn,
});
const multiviewerFlowOutput = new MediaConnect.CfnFlowOutput(stack, 'multiviewerFlowOutput', {
    flowArn: multiviewerFlow.attrFlowArn,
    name: "multiviewer-output",
    port: 3001,
    protocol: "srt-listener",
    cidrAllowList: [ "0.0.0.0/0" ],
});

const taskRole = new IAM.Role(stack, 'taskRole', {
    assumedBy: new IAM.ServicePrincipal('ecs-tasks.amazonaws.com'),
});

function createSourceTaskDefinition(color: VideoStream): ECS.TaskDefinition {

    const videoSourceTaskDefinition = new ECS.FargateTaskDefinition(stack, `${color}VideoSourceTaskDefinition`, {
        cpu: 1024, // 1 vCPU
        memoryLimitMiB: 2048, // 2 GiB
        runtimePlatform: {
            cpuArchitecture: ECS.CpuArchitecture.X86_64,
            operatingSystemFamily: ECS.OperatingSystemFamily.LINUX,
        },
        taskRole,
    });
    const videoSourceContainer = videoSourceTaskDefinition.addContainer(`${color}VideoSourceContainer`, {
        containerName: `${color}-video-source`,
        image: ECS.ContainerImage.fromAsset('./video-source'),
        logging: ECS.LogDriver.awsLogs({
            streamPrefix: `${stackNameKebab}-${color}-video-source-container`,
        }),
    });

    const { flow } = flows[color];

    videoSourceContainer.addEnvironment('COLOR', color);
    videoSourceContainer.addEnvironment('TARGET_URL', `srt://${flow.attrSourceIngestIp}:${flow.attrSourceSourceIngestPort}`);

    return videoSourceTaskDefinition;

}

const sourceTaskDefinition = enumMap(VideoStream, createSourceTaskDefinition);

const videoMixerTaskDefinition = new ECS.FargateTaskDefinition(stack, 'videoMixerTaskDefinition', {
    cpu: 1024, // 1 vCPU
    memoryLimitMiB: 2048, // 2 GiB
    runtimePlatform: {
        cpuArchitecture: ECS.CpuArchitecture.X86_64,
        operatingSystemFamily: ECS.OperatingSystemFamily.LINUX,
    },
    taskRole,
});
const videoMixerContainer = videoMixerTaskDefinition.addContainer('videoMixerContainer', {
    containerName: 'video-mixer',
    image: ECS.ContainerImage.fromAsset('./video-mixer'),
    logging: ECS.LogDriver.awsLogs({
        streamPrefix: `${stackNameKebab}-video-mixer-container`,
    }),
});

Object.entries(flows).forEach(([color, {flow, output}]) => {
    videoMixerContainer.addEnvironment(`${color.toUpperCase()}_SOURCE_URL`, `srt://${flow.attrSourceIngestIp}:${output.port}`)
});
videoMixerContainer.addEnvironment('OUTPUT_URL', `srt://${multiviewerFlow.attrSourceIngestIp}:${multiviewerFlow.attrSourceSourceIngestPort}`);

const cluster = new ECS.Cluster(stack, "videoMixerCluster", {
    clusterName: `${stackNameKebab}-cluster`,
    vpc: EC2.Vpc.fromVpcAttributes(stack, `fromVpc`, {
        vpcId: multiviewerVpc.vpc.vpcId,
        availabilityZones: [
            `${environment.REGION}a`,
        ],
    }),
});

const sourceService = enumMap(VideoStream, (color) => {

    const service = new ECS.FargateService(stack, `${color}SourceService`, {
        cluster,
        securityGroups: [ multiviewerVpc.wideOpenSecurityGroup ],
        taskDefinition: sourceTaskDefinition[color],
        assignPublicIp: true,
        vpcSubnets: {
            subnets: [ multiviewerVpc.publicSubnet ],
        },
    });

    service.node.addDependency(flowStart[color]);

    return service;

});

const mixerService = new ECS.FargateService(stack, 'videoMixerService', {
    cluster,
    securityGroups: [ multiviewerVpc.wideOpenSecurityGroup ],
    taskDefinition: videoMixerTaskDefinition,
    assignPublicIp: true,
    vpcSubnets: {
        subnets: [ multiviewerVpc.publicSubnet ],
    },
});

Object.values(sourceService).forEach((dependable: IDependable) => mixerService.node.addDependency(dependable));
mixerService.node.addDependency(multiviewerFlowStart);

new CDK.CfnOutput(stack, 'multiviewerOutputUrl', {
    value: `srt://${multiviewerFlow.attrSourceIngestIp}:${multiviewerFlowOutput.port}`,
})

app.synth();
