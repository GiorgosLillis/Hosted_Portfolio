import React, { useState, useEffect, useRef } from "react";
import { useAuth } from './auth.jsx';
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';
import { isValidEmail, isValidPassword, isValidName } from '../common/validation.js';

const SignUp = ({ switchToLogin, showToast }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [first_name, setFirstName] = useState('');
    const [last_name, setLastName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth() || {};
    const headingRef = useRef(null);

    useEffect(() => {
        loadRecaptchaScript();
        headingRef.current?.focus();
    }, []);

    const handleSignUp = async () => {
        setIsLoading(true);

        try {

            // Same format rules the server enforces
            if (!isValidEmail(email)) {
                showToast('Please enter a valid email address', 'danger');
                return;
            }
            if (!isValidPassword(password)) {
                showToast('Password must be at least 8 characters long and include uppercase, lowercase, number, and special character', 'danger');
                return;
            }
            if (!isValidName(first_name)) {
                showToast('Please enter a valid first name (1-50 characters, letters, hyphens, apostrophes only)', 'danger');
                return;
            }
            if (!isValidName(last_name)) {
                showToast('Please enter a valid last name (1-50 characters, letters, hyphens, apostrophes only)', 'danger');
                return;
            }

            const token = await getRecaptchaToken('signup');

            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'g-recaptcha-response': token
                },
                body: JSON.stringify({
                    email,
                    password,
                    first_name,
                    last_name
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                showToast(data.message, 'danger');
                return;
            }

            login(data.user);
            setPassword('');
            setEmail('');
            setFirstName('');
            setLastName('');
            showToast('Sign-Up successful!', 'success');

        } catch (err) {
            showToast(err.message, 'danger');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <h1 ref={headingRef} tabIndex={-1} className="p-0 my-3 text-center">Sign Up</h1>

            <div className="row p-0 mb-4 w-100 d-flex justify-content-around align-items-center" id="list-form">
                <div className="col-10 col-md-8 mb-4">
                    <label className="form-label mb-0" htmlFor="email">
                        <span className="h2">Email</span>
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
                        <span className="h2">Password</span>
                    </label>
                    <input
                        type="password"
                        className="form-control"
                        id="password"
                        placeholder="*********"
                        aria-label="Write your password here"
                        aria-describedby="password-conditions"
                        value={password}
                        minLength={8}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                    />
                    <span id="password-conditions" className="d-flex text-start conditions">At least 8 characters long with uppercase, lowercase, number, and special character</span>
                </div>
                <div className="col-10 col-md-8 mb-4">
                    <label htmlFor="first-name" className="form-label mb-0">
                        <span className="h2">First name</span>
                    </label>
                    <input
                        type="text"
                        className="form-control"
                        id="first-name"
                        placeholder="First Name"
                        aria-label="Write your first name here"
                        aria-describedby="first-name-conditions"
                        value={first_name}
                        minLength={1}
                        maxLength={50}
                        onChange={(e) => setFirstName(e.target.value)}
                        disabled={isLoading}
                    />
                    <span id="first-name-conditions" className="d-flex text-start conditions">At most 50 characters long</span>
                </div>
                <div className="col-10 col-md-8 mb-4">
                    <label htmlFor="last-name" className="form-label mb-0">
                        <span className="h2">Last name</span>
                    </label>
                    <input
                        type="text"
                        className="form-control"
                        id="last-name"
                        placeholder="Last Name"
                        aria-label="Write your last name here"
                        aria-describedby="last-name-conditions"
                        value={last_name}
                        minLength={1}
                        maxLength={50}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={isLoading}
                    />
                    <span id="last-name-conditions" className="d-flex text-start conditions">At most 50 characters long</span>
                </div>
            </div>

            <div className="row w-100 d-flex flex-column justify-content-around align-items-center mb-3">
                <div className="col-6 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn btn-sm px-0 filter-btn text-center mb-3"
                        id="sign-up"
                        aria-label="Sign up for a new account"
                        onClick={handleSignUp}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center button-span">
                            {isLoading ? 'Signing up...' : 'Sign-up'}
                        </span>
                    </button>
                </div>
                <div className="col-12 col-md-10 d-flex justify-content-center align-items-center">
                    <p className="mb-0 profile-span">
                        Have an account?{' '}
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