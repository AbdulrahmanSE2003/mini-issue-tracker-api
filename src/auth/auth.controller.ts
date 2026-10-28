import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { SignupDTO } from './dtos/signupDTO.js';
import { SigninDTO } from './dtos/signinDTO.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { SessionAuthGuard } from './guards/session-auth.guard.js';
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '../constants/cookie.constants.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  private async createSession(req: Request, userId: string): Promise<void> {
    try {
      // Regenerate first — prevents session fixation by discarding any
      // pre-login session id before attaching this user to it.
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((error) => (error ? reject(error) : resolve()));
      });

      req.session.userId = userId;

      await new Promise<void>((resolve, reject) => {
        req.session.save((error) => (error ? reject(error) : resolve()));
      });
    } catch {
      throw new InternalServerErrorException('Could not create session');
    }
  }

  @Post('signup')
  async signup(@Body() signupDTO: SignupDTO, @Req() req: Request) {
    const user = await this.usersService.createUser(signupDTO);
    await this.createSession(req, user.id);
    return { user };
  }

  @Post('signin')
  async signin(@Body() signinDTO: SigninDTO, @Req() req: Request) {
    const user = await this.authService.login(signinDTO);
    await this.createSession(req, user.id);
    return { user };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (req.session?.userId) {
      try {
        await new Promise<void>((resolve, reject) => {
          req.session.destroy((error) => (error ? reject(error) : resolve()));
        });
      } catch {
        throw new InternalServerErrorException('Could not destroy session');
      }
    }

    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
    return { message: 'Logged out successfully' };
  }

  @UseGuards(SessionAuthGuard)
  @Get('me')
  async getMe(@Req() req: Request) {
    const userId = req.session.userId;
    if (!userId) throw new UnauthorizedException();
    return this.usersService.getMe(userId);
  }
}
