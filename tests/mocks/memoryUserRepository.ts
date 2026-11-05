import { IUserRepository } from '@/lib/repositories/userRepository';
import { UserRecord, CreateUserDTO } from '@/types/user';

export class MemoryUserRepository implements IUserRepository {
  private users: UserRecord[] = [];
  private nextId = 1;

  async findByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.trim().toLowerCase();
    const user = this.users.find((u) => u.email === normalized);
    return user ? { ...user } : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = this.users.find((u) => u.id === id);
    return user ? { ...user } : null;
  }

  async create(data: CreateUserDTO): Promise<UserRecord> {
    const normalized = data.email.trim().toLowerCase();
    const existing = await this.findByEmail(normalized);
    if (existing) {
      throw new Error('User with this email already exists');
    }

    const now = new Date();
    const newUser: UserRecord = {
      id: `user_${this.nextId++}`,
      email: normalized,
      passwordHash: data.passwordHash,
      name: data.name ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.users.push(newUser);
    return { ...newUser };
  }

  async deleteById(id: string): Promise<boolean> {
    const index = this.users.findIndex((u) => u.id === id);
    if (index !== -1) {
      this.users.splice(index, 1);
      return true;
    }
    return false;
  }

  // Helper for test cleanup
  clear(): void {
    this.users = [];
    this.nextId = 1;
  }
}
