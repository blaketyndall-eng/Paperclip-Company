import { render, screen } from '@testing-library/react';
import App from '../../src/App';

describe('App', () => {
  it('renders dashboard heading', () => {
    render(<App />);
    expect(screen.getByText('Paperclip Company MVP Dashboard')).toBeInTheDocument();
  });
});
