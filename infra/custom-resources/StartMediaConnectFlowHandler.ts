import type {CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse} from "aws-lambda";
import * as AWS from 'aws-sdk';

import {StartMediaConnectFlowProps} from "./StartMediaConnectFlow";

const mediaconnect = new AWS.MediaConnect();
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function handler(event: CloudFormationCustomResourceEvent): Promise<CloudFormationCustomResourceResponse> {
    const props = event.ResourceProperties as StartMediaConnectFlowProps & {ServiceToken: string};
    console.log({props});

    while (true) {

        const flow = await mediaconnect.describeFlow({
            FlowArn: props.flowArn,
        }).promise();

        const {Status: status} = flow.Flow!;

        switch (event.RequestType) {
            case "Create":
            case "Update":

                switch (status) {
                    case 'STANDBY':
                        // Start
                        await mediaconnect.startFlow({
                            FlowArn: props.flowArn,
                        }).promise();
                        await delay(20 * 1000);
                        continue;


                    case 'ACTIVE':
                        // Return success
                        return {
                            ...event,
                            Status: "SUCCESS",
                            PhysicalResourceId: 'START' + props.flowArn,
                        };

                    case 'STARTING':
                    case 'STOPPING':
                    case 'UPDATING':
                        // Wait
                        await delay(20 * 1000);
                        continue;


                    case 'DELETING':
                    case 'ERROR':
                    default:
                        // Error
                        return {
                            ...event,
                            Status: "FAILED",
                            PhysicalResourceId: 'START' + props.flowArn,
                            Reason: `Cannot start flow that is in state '${status}'.`,
                        };
                }



            case "Delete":

                switch (flow.Flow!.Status) {
                    case 'ACTIVE':
                        // STOP
                        await mediaconnect.stopFlow({
                            FlowArn: props.flowArn,
                        }).promise();
                        await delay(20 * 1000);
                        continue;


                    case 'STANDBY':
                        return {
                            ...event,
                            Status: "SUCCESS",
                            PhysicalResourceId: 'START' + props.flowArn,
                        };


                    case 'STOPPING':
                    case 'STARTING':
                    case 'UPDATING':
                        // Wait
                        await delay(20 * 1000);
                        continue;


                    case 'DELETING':
                    case 'ERROR':
                    default:
                        // Error
                        return {
                            ...event,
                            Status: "FAILED",
                            PhysicalResourceId: 'START' + props.flowArn,
                            Reason: `Cannot stop flow that is in state '${status}'.`,
                        };
                }

        }

    }


}
