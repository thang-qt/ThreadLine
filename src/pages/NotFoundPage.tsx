import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return <main className="empty-state"><h1>Not found</h1><Link to="/">Return to front page</Link></main>;
}
