import React, { useState, useEffect, useRef } from "react";
import { useAuth } from './auth.jsx';
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';
import { isValidEmail, isValidPassword } from '../common/validation.js';
import { fetchWithTimeout } from '../common/fetchWithTimeout.js';
import { useTranslation } from 'react-i18next';
import { apiMessage } from '../common/i18n.js';

const Login = ({ switchToSignUp, switchToForgot, showToast }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth() || {};
    const headingRef = useRef(null);
    const { t } = useTranslation();

    useEffect(() => {
        loadRecaptchaScript();
        // Move focus to this view's heading 
        headingRef.current?.focus();
    }, []);

    const handleLogin = async () => {
        setIsLoading(true);

        try {
            // Same format rules the server enforces
            if (!isValidEmail(email)) {
                throw new Error(t('toast-invalid-email'));
            }

            if (!isValidPassword(password)) {
                throw new Error(t('toast-invalid-pass'));
            }

            const token = await getRecaptchaToken('login');

            const response = await fetchWithTimeout('/api/login', {
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
                if (data.code === 'invalid-credentials') setPassword('');
                throw new Error(apiMessage(data, t('toast-something-wrong')));
            }

            login(data.user);
            setPassword('');
            setEmail('');
            showToast(t('toast-login-success'), 'success');

        } catch (err) {
            showToast(err.message, 'danger');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <h1 ref={headingRef} tabIndex={-1} className="p-0 my-3 text-center">{t('login')}</h1>

            <div className="row p-0 mb-4 w-100 d-flex justify-content-around align-items-center" id="list-form">
                <div className="col-10 col-md-8 mb-4">
                    <label className="form-label mb-0" htmlFor="email">
                        <span className="h2">{t('edit-email')}</span>
                    </label>
                    <input
                        type="email"
                        className="form-control"
                        id="email"
                        placeholder={t('edit-email-placeholder')}
                        aria-label={t('edit-email-aria')}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isLoading}
                    />
                </div>
                <div className="col-10 col-md-8 mb-4">
                    <label htmlFor="password" className="form-label mb-0">
                        <span className="h2">{t('password')}</span>
                    </label>
                    <input
                        type="password"
                        className="form-control"
                        id="password"
                        placeholder="*********"
                        aria-label={t('password-aria')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                    />
                </div>
            </div>

            <div className="row w-100 d-flex flex-column justify-content-around align-items-center mb-3">
                <div className="col-6 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn btn-sm px-0 filter-btn text-center mb-3"
                        id="sign-in"
                        aria-label={t('sign-in-aria')}
                        onClick={handleLogin}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center button-span">
                            {isLoading ? t('signing-in') : t('sign-in')}
                        </span>
                    </button>
                </div>
                <div className="col-12 col-md-10 d-flex justify-content-center align-items-center">
                    <p className="mb-0 profile-span text-center">
                        {t('forgot-prompt')}{' '}
                        <button
                            type="button"
                            className="p-0 m-0 align-baseline profile-btn"
                            aria-label={t('reset-link-aria')}
                            onClick={switchToForgot}
                            disabled={isLoading}
                        >
                            {t('reset-password')}
                        </button>
                    </p>
                </div>
                <div className="col-12 col-md-10 d-flex justify-content-center align-items-center">
                    <p className="mb-0 profile-span">
                        {t('no-account')}{' '}
                        <button
                            type="button"
                            className="p-0 m-0 align-baseline profile-btn"
                            aria-label={t('sign-up-link-aria')}
                            onClick={switchToSignUp}
                            disabled={isLoading}
                        >
                            {t('sign-up')}
                        </button>
                    </p>
                </div>
            </div>
        </>
    );
};

export default Login; 