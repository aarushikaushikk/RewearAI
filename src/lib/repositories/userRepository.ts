import { UserRecord, UserWithoutPassword, CreateUserDTO } from '@/types/user';

export interface IUserRepository {
  /** Includes the password hash, which is null for an account with no password. */
  findByEmail(email: string): Promise<UserRecord | null>;
  /** Must not load the password hash, or include the key at all, even as undefined. */
  findById(id: string): Promise<UserWithoutPassword | null>;
  create(data: CreateUserDTO): Promise<UserRecord>;
  deleteById?(id: string): Promise<boolean>;
}
