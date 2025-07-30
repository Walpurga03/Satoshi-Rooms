import type { ReactNode } from 'react';
import './Layout.scss';

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="layout">
      <header className="layout__header">satoshiRooms</header>
      <main className="layout__main">{children}</main>
    </div>
  );
}
