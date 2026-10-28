import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as argon2 from 'argon2';

import { User } from './schemas/user.schema.js';
import { SignupDTO } from '../auth/dtos/signupDTO.js';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  private toPublicUser(user: User): PublicUser {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    };
  }

  async createUser(signupDTO: SignupDTO): Promise<PublicUser> {
    const normalizedEmail = signupDTO.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(signupDTO.password);

    try {
      const user = await this.userModel.create({
        name: signupDTO.name.trim(),
        email: normalizedEmail,
        passwordHash,
        deletedAt: null,
      });

      return this.toPublicUser(user);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new ConflictException('Email already exists');
      }
      throw error;
    }
  }

  /** Includes passwordHash — for internal auth use only, never return this directly. */
  async findByEmailWithPassword(email: string) {
    return this.userModel
      .findOne({ email: email.trim().toLowerCase(), deletedAt: null })
      .select('+passwordHash');
  }

  async findActiveById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.userModel.findOne({ _id: id, deletedAt: null });
  }

  async getMe(userId: string): Promise<{ user: PublicUser }> {
    const user = await this.findActiveById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return { user: this.toPublicUser(user) };
  }
}
