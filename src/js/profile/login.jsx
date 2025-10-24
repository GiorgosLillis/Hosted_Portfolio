import React, { useState, useEffect } from "react";
import { useAuth } from './auth.jsx';
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';

const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

const Login = ({ switchToSignUp, showToast }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth() || {};

    useEffect(() => {
        loadRecaptchaScript();
    }, []);

    const handleLogin = async () => {
        setIsLoading(true);

        try {
            if (!email || !emailRegex.test(email)) {
                throw new Error('Please enter a valid email address');
            }
        
            if (!password || !passwordRegex.test(password)) {
                throw new Error('Password must be at least 8 characters long and include uppercase, lowercase, number, and special character');
            }

            const token = await getRecaptchaToken('login');

                        const response = await fetch('/api/login', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'g-recaptcha-response': token
                            },
                            body: JSON.stringify({
                                email: email,
                                password: password
                            }),
                        });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message|| 'Something went wrong');
            }

            login(data.user);
            setPassword('');
            setEmail('');
            showToast('Login successful!', 'success');

        } catch (err) {
            showToast(err.message, 'danger');
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
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                    />
                </div>
            </div>

            <div className="row w-100 d-flex flex-column justify-content-around align-items-center mb-3">
                <div className="col-4 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn btn-sm px-0 filter-btn text-center mb-3"
                        id="sign-in"
                        aria-label="Sign in to your account"
                        onClick={handleLogin}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center">
                            {isLoading ? 'Signing in...' : 'Sign-in'}
                        </span>
                    </button>
                </div>
                <div className="col-8 d-flex justify-content-center align-items-center">
                    <p className="mb-0 profile-span">
                        Don't have an account?{' '}
                        <button
                            type="button"
                            className="p-0 m-0 align-baseline profile-btn"
                            aria-label="Click here to sign up"
                            onClick={switchToSignUp}
                            disabled={isLoading}
                        >
                            Sign Up
                        </button>
                    </p>
                </div>
            </div>
        </>
    );
};

export default Login; 