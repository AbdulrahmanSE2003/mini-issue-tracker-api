import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';

import { UsersService, PublicUser } from '../users/users.service.js';
import { SigninDTO } from './dtos/signinDTO.js';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async login(signinDTO: SigninDTO): Promise<PublicUser> {
    const user = await this.usersService.findByEmailWithPassword(
      signinDTO.email,
    );

    // Same generic message whether the email doesn't exist or the password
    // is wrong — never reveal which one it was.
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      signinDTO.password,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    };
  }
}
