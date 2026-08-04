import React, { useState, useEffect, useRef } from "react";
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';
import { isValidEmail } from '../common/validation.js';

const Forgot = ({ switchToLogin, showToast }) => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const headingRef = useRef(null);

    useEffect(() => {
        loadRecaptchaScript();
    }, []);

    // Re-runs on mount AND when submitted flips true, since the success message replaces
    // the form in place (no remount) - focus needs to move again to announce it
    useEffect(() => {
        headingRef.current?.focus();
    }, [submitted]);

    const handleForgot = async () => {
        setIsLoading(true);

        try {
            if (!isValidEmail(email)) {
                throw new Error('Please enter a valid email address');
            }

            const token = await getRecaptchaToken('forgot');

            const response = await fetch('/api/forgot', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'g-recaptcha-response': token
                },
                body: JSON.stringify({
                    email: email
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Something went wrong');
            }

            showToast(data.message, 'success');
            setSubmitted(true);

        } catch (err) {
            showToast(err.message, 'danger');
        } finally {
            setIsLoading(false);
        }
    }

    if (submitted) {
        return (
            <>
                <h1 ref={headingRef} tabIndex={-1} className="p-0 my-3 text-center">Check your email</h1>
                <p className="mb-3 profile-span text-center col-10 col-md-8 mx-auto">
                    If an account with that email exists, a reset link has been sent. Check your inbox.
                </p>
                <div className="row w-100 d-flex justify-content-around align-items-center mb-3">
                    <div className="col-6 d-flex justify-content-center align-items-center">
                        <button
                            type="button"
                            className="btn btn-sm px-0 filter-btn text-center mb-3"
                            aria-label="Back to login"
                            onClick={switchToLogin}
                        >
                            <span className="d-flex text-center justify-content-center button-span">
                                Back to Login
                            </span>
                        </button>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <h1 ref={headingRef} tabIndex={-1} className="p-0 my-3 text-center">Forgot Password</h1>

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
            </div>

            <div className="row w-100 d-flex flex-column justify-content-around align-items-center mb-3">
                <div className="col-6 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn btn-sm px-0 filter-btn text-center mb-3"
                        aria-label="Send reset link"
                        onClick={handleForgot}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center button-span">
                            {isLoading ? 'Sending...' : 'Send reset link'}
                        </span>
                    </button>
                </div>
                <div className="col-12 col-md-10 d-flex justify-content-center align-items-center">
                    <p className="mb-0 profile-span">
                        Remembered your password?{' '}
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
}

export default Forgot; 