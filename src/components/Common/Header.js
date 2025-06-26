import React from 'react';
import { Link } from 'react-router-dom';
import LogoutButton from './LogoutButton';
import './Header.css';

function Header({ menuItems, showLogout = true, title }) {
  return (
    <header className="site-header">
      <div className="header-left">
        <Link to="/">
          <img src="/images/unison-logo.png" alt="Unison Logo" className="header-logo" />
        </Link>
      </div>
      <div className="header-center">
        {title && <h1 className="page-title">{title}</h1>}
      </div>
      <div className="header-right">
        {menuItems && (
          <nav className="header-menu">
            {menuItems.map((item, index) => (
              <Link key={index} to={item.link} className="header-menu-item">
                {item.name}
              </Link>
            ))}
          </nav>
        )}
        {showLogout && <LogoutButton />}
      </div>
    </header>
  );
}

export default Header;