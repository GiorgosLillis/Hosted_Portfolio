import React, { useState } from "react";
import { useAuth } from './auth.jsx';

const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const nameRegex = /^[a-zA-Z'-]{1,50}$/;

const SignUp = ({ switchToLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [first_name, setFirstName] = useState('');
    const [last_name, setLastName] = useState('');
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth() || {};

    const handleSignUp = async () => {
        setIsLoading(true);
        setError(null);

        try {

            if (!email || !emailRegex.test(email)) {
                throw new Error('Please enter a valid email address');
            }
            if (!password || !passwordRegex.test(password)) {
                throw new Error('Password must be at least 8 characters long and include uppercase, lowercase, number, and special character');
            }
            if (!first_name || !nameRegex.test(first_name)) {
                throw new Error('Please enter a valid first name (1-50 characters, letters, hyphens, apostrophes only)');
            }
            if (!last_name || !nameRegex.test(last_name)) {
                throw new Error('Please enter a valid last name (1-50 characters, letters, hyphens, apostrophes only)');
            }

            const response = await fetch('/api/sign-up', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password, first_name, last_name}),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Something went wrong');
            }

            // Assuming the API returns a token, you can save it and redirect
            login(data.user, data.token);
            alert('Sign-Up successful!'); // Placeholder for success action

        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <h1 className="p-0 my-3 text-center">Profile</h1>

            <div className="row p-0 mb-4 w-100 d-flex justify-content-around align-items-center" id="list-form">
                <div className="col-10 col-md-8 mb-4">
                    <label className="form-label mb-0" htmlFor="email">
                        <h2>Email</h2>
                    </label>
                    <input
                        type="email"
                        className="form-control"
                        id="email"
                        placeholder="Write your email here"
                        aria-label="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isLoading}
                    />
                </div>
                <div className="col-10 col-md-8 mb-4">
                    <label htmlFor="password" className="form-label mb-0">
                        <h2>Password</h2>
                    </label>
                    <input
                        type="password" 
                        className="form-control"
                        id="password"
                        placeholder="*********"
                        aria-label="Write your password here"
                        value={password}
                        minLength={8}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                    />
                    <span className="d-flex text-start conditions">A least 8 characters long with uppercase, lowercase, number, and special character</span>
                </div>
                 <div className="col-10 col-md-8 mb-4">
                    <label htmlFor="first-name" className="form-label mb-0">
                        <h2>First name</h2>
                    </label>
                    <input
                        type="text" 
                        className="form-control"
                        id="first-name"
                        placeholder="First Name"
                        aria-label="Write your first name here"
                        value={first_name}
                        minLength={1}
                        maxLength={50}
                        onChange={(e) => setFirstName(e.target.value)}
                        disabled={isLoading}
                    />
                    <span className="d-flex text-start conditions">At most 50 characters long</span>
                </div>
                 <div className="col-10 col-md-8 mb-4">
                    <label htmlFor="last-name" className="form-label mb-0">
                        <h2>Last name</h2>
                    </label>
                    <input
                        type="text" 
                        className="form-control"
                        id="last-name"
                        placeholder="Last Name"
                        aria-label="Write your last name here"
                        value={last_name}
                        minLength={1}
                        maxLength={50}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={isLoading}
                    />
                    <span className="d-flex text-start conditions">At most 50 characters long</span>
                </div>
            </div>

            {error && <div className="alert alert-danger col-8">{error}</div>}

            <div className="row w-100 d-flex flex-column justify-content-around align-items-center mb-3">
                <div className="col-4 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn btn-sm px-0 filter-btn text-center mb-3"
                        id="sign-up"
                        aria-label="Sign up for a new account"
                        onClick={handleSignUp}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center">
                            {isLoading ? 'Signing in...' : 'Sign-up'}
                        </span>
                    </button>
                </div>
                <div className="col-8 d-flex justify-content-center align-items-center">
                    <p className="mb-0 profile-span">
                        Already have an account?{' '}
                        <button
                            type="button"
                            className="p-0 m-0 align-baseline profile-btn"
                            aria-label="Click here to login"
                            onClick={switchToLogin}
                            disabled={isLoading}
                        >
                            Login
                        </button>
                    </p>
                </div>
            </div>
        </>
    );
};

export default SignUp; 