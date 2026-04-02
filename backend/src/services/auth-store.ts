import { AuthAuditEvent, Session, User } from '../models/auth.js';

// Week 2 foundation: in-memory auth model until DB migrations are wired.
class AuthStore {
  private users = new Map<string, User>();
  private sessions = new Map<string, Session>();
  private auditEvents: AuthAuditEvent[] = [];

  upsertUser(user: User): User {
    this.users.set(user.id, user);
    return user;
  }

  findUserById(id: string): User | undefined {
    return this.users.get(id);
  }

  createSession(session: Session): Session {
    this.sessions.set(session.id, session);
    return session;
  }

  addAuditEvent(event: AuthAuditEvent): void {
    this.auditEvents.push(event);
  }

  listAuditEvents(userId?: string): AuthAuditEvent[] {
    if (!userId) {
      return this.auditEvents;
    }
    return this.auditEvents.filter((event) => event.userId === userId);
  }
}

export const authStore = new AuthStore();
