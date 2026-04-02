import { render, screen } from '@testing-library/react';
import App from '../../src/App';

describe('App', () => {
  it('renders login prompt when unauthenticated', () => {
    render(<App />);
    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
  });
});
