import { UserRecord, CreateUserDTO } from '@/types/user';

export interface IUserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(data: CreateUserDTO): Promise<UserRecord>;
}
