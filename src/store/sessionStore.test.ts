import { useSessionStore } from './sessionStore';

const mockSession = { user: { id: 'user-1', email: 'a@b.com' } } as any;

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState({ session: null, loading: true });
  });

  it('starts with no session and loading true', () => {
    expect(useSessionStore.getState().session).toBeNull();
    expect(useSessionStore.getState().loading).toBe(true);
  });

  it('setSession stores the session and flips loading to false', () => {
    useSessionStore.getState().setSession(mockSession);
    expect(useSessionStore.getState().session).toBe(mockSession);
    expect(useSessionStore.getState().loading).toBe(false);
  });

  it('setSession(null) clears the session and flips loading to false', () => {
    useSessionStore.getState().setSession(mockSession);
    useSessionStore.getState().setSession(null);
    expect(useSessionStore.getState().session).toBeNull();
    expect(useSessionStore.getState().loading).toBe(false);
  });
});
