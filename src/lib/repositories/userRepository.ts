import {
  CreatePasswordlessUserDTO,
  CreateUserDTO,
  UserRecord,
  UserWithoutPassword,
} from '@/types/user';

export interface IUserRepository {
  /** Includes the password hash, which is null for an account with no password. */
  findByEmail(email: string): Promise<UserRecord | null>;
  /** Must not load the password hash, or include the key at all, even as undefined. */
  findById(id: string): Promise<UserWithoutPassword | null>;
  create(data: CreateUserDTO): Promise<UserRecord>;
  deleteById?(id: string): Promise<boolean>;
  /** A new ID for createWithoutPassword, usable before the user exists. Sends no query. */
  newId(): string;
  /**
   * Throws DuplicateEmailError if the email is taken, and DuplicateUserIdError if the ID is.
   * The ID comes from newId(), so a linked account can be written before its user.
   */
  createWithoutPassword(data: CreatePasswordlessUserDTO): Promise<UserWithoutPassword>;
}
