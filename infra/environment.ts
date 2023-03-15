import {IsNumberString, IsString} from 'class-validator';

export class Environment {

    @IsNumberString()
    ACCOUNT_ID!: string;

    @IsString()
    REGION!: string;

}
