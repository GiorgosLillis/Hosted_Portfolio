import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider, useAuth } from './auth.jsx'; // Import AuthProvider and useAuth
import LoginForm from './login.jsx';
import SignUpForm from './sign-up.jsx';
import EditForm from './edit.jsx';
import { showToast } from '../common/toast.js';

const AuthManager = () => {
    const { isAuthenticated, user, logout, isLoading } = useAuth();
    const [view, setView] = useState('initial'); // 'initial', 'login', 'signup'

    if (isLoading) {
        return <h1 className="p-0 my-3 text-center">Loading...</h1>;
    }

    if (isAuthenticated) {
        // If user is authenticated, show the EditForm/Profile view
        return <EditForm userData={user} switchToLogout={logout} showToast={showToast} />;
    }

    const renderInitialView = () => (
        <>
            <h1 className="p-0 my-3 text-center">Profile</h1>
            <div className="row w-100 d-flex justify-content-around align-items-center mb-3">
                <div className="col-10 col-md-8 col-lg-5 col-xl-4 d-flex justify-content-center align-items-center mb-3 mb-lg-0">
                    <button
                        type="button"
                        className="btn btn-sm px-0 filter-btn text-center"
                        onClick={() => setView('login')}
                    >
                        <span className="d-flex text-center justify-content-center button-span">Login</span>
                    </button>
                </div>
                <div className="col-10 col-md-8 col-lg-5 col-xl-4 d-flex justify-content-center align-items-center mb-3 mb-lg-0">
                    <button
                        type="button"
                        className="btn btn-sm px-0 filter-btn text-center"
                        onClick={() => setView('signup')}
                    >
                        <span className="d-flex text-center justify-content-center button-span">Sign-Up</span>
                    </button>
                </div>
            </div>
        </>
    );

    switch (view) {
        case 'login':
            // The login form will call the login function from the context upon success
            return <LoginForm switchToSignUp={() => setView('signup')} showToast={showToast} />;
        case 'signup':
            return <SignUpForm switchToLogin={() => setView('login')} showToast={showToast} />;
        case 'initial':
        default:
            return renderInitialView();
    }
};

// Mount the React component when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  let container = document.getElementById('profile-form');
  if (!container) {
    container = document.createElement('form');
    container.id = 'profile-form';
    const main = document.querySelector('main');
    if (main) {
        main.appendChild(container);
    } else {
        document.body.appendChild(container);
    }
  }

  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <AuthProvider> 
        <AuthManager />
      </AuthProvider>
    </React.StrictMode>
  );
});