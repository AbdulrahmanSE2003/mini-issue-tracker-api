import { IsEmail, IsString, Length, Validate } from 'class-validator';
import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'PasswordsMatch', async: false })
class PasswordsMatchConstraint implements ValidatorConstraintInterface {
  validate(passwordConfirm: string, args: ValidationArguments) {
    const object = args.object as SignupDTO;
    return passwordConfirm === object.password;
  }
  defaultMessage() {
    return 'Passwords do not match';
  }
}

export class SignupDTO {
  @IsString()
  @Length(2, 60)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @Length(8, 128)
  password: string;

  @IsString()
  @Validate(PasswordsMatchConstraint)
  passwordConfirm: string;
}
