import * as CDK from "aws-cdk-lib";
import * as EC2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

import { Environment } from "./environment";

export class PublicVpc extends Construct {

    private get stackName(): string {
        return CDK.Stack.of(this).stackName;
    }

    vpc: EC2.IVpc = (() => {

        const cfnVpc = new EC2.CfnVPC(this, `vpc`, {
            cidrBlock: '10.0.0.0/16',
        });
        CDK.Tags.of(cfnVpc).add("Name", `${this.stackName}-vpc`);

        return EC2.Vpc.fromVpcAttributes(this, `fromVpc`, {
            vpcId: cfnVpc.ref,
            availabilityZones: [
                `${this.environment.REGION}a`,
            ],
        });

    })();


    publicSubnet: EC2.ISubnet = (() => {

        const cfnSubnet = new EC2.CfnSubnet(this, `publicCfnSubnet`, {
            availabilityZone: `${this.environment.REGION}a`,
            cidrBlock: '10.0.0.0/24',
            vpcId: this.vpc.vpcId,
        });
        CDK.Tags.of(cfnSubnet).add("Name", `${this.stackName}-public-subnet`);

        return EC2.Subnet.fromSubnetId(this, 'fromSubnet', cfnSubnet.attrSubnetId);

    })();


    wideOpenSecurityGroup: EC2.ISecurityGroup = (() => {

        const cfnSecurityGroup = new EC2.CfnSecurityGroup(this, `wideOpenCfnSecurityGroup`, {
            groupDescription: "Open Access",
            vpcId: this.vpc.vpcId,
            groupName: `${this.stackName}-open-access-sg`,
        });

        return EC2.SecurityGroup.fromSecurityGroupId(this, 'wideOpenSecurityGroup', cfnSecurityGroup.attrGroupId);

    })();

    constructor(scope: Construct, id: string, private environment: Environment) {
        super(scope, id);

        const publicRouteTable = new EC2.CfnRouteTable(this, `publicRouteTable`, {
            vpcId: this.vpc.vpcId,
        });
        CDK.Tags.of(publicRouteTable).add("Name", `${this.stackName}-public-route-table`);

        new EC2.CfnSubnetRouteTableAssociation(this, `publicSubnetRouteTableAssociation`, {
            routeTableId: publicRouteTable.ref,
            subnetId: this.publicSubnet.subnetId,
        });

        const internetGateway: EC2.CfnInternetGateway = new EC2.CfnInternetGateway(this, `internetGateway`, {
            tags: [{
                key: 'Name',
                value: `${this.stackName}-igw`,
            }],
        });
        const internetGatewayAttachment = new EC2.CfnVPCGatewayAttachment(this, `internetGatewayAttachment`, {
            internetGatewayId: internetGateway.ref,
            vpcId: this.vpc.vpcId,
        });
        const internetGatewayRoute = new EC2.CfnRoute(this, `routeToInternetGateway`, {
            routeTableId: publicRouteTable.ref,
            gatewayId: internetGateway.ref,
            destinationCidrBlock: "0.0.0.0/0",
        })
        internetGatewayRoute.addDependency(internetGatewayAttachment);
    }

}