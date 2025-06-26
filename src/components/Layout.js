// File: src/components/Layout.js
import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Common/Header'; // Or wherever your Header component lives

function Layout() {
  return (
    <>
      <Header />
      <main style={{ padding: '20px' }}>
        <Outlet />
      </main>
    </>
  );
}

export default Layout;