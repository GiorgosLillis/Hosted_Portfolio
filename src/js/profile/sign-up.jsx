import React, { useState, useEffect, useRef } from "react";
import { useAuth } from './auth.jsx';
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';
import { isValidEmail, isValidPassword, isValidName } from '../common/validation.js';
import { fetchWithTimeout } from '../common/fetchWithTimeout.js';
import { useTranslation } from 'react-i18next';
import { apiMessage } from '../common/i18n.js';

const SignUp = ({ switchToLogin, showToast }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [first_name, setFirstName] = useState('');
    const [last_name, setLastName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth() || {};
    const headingRef = useRef(null);
    const { t } = useTranslation();

    useEffect(() => {
        loadRecaptchaScript();
        headingRef.current?.focus();
    }, []);

    const handleSignUp = async () => {
        setIsLoading(true);

        try {

            // Same format rules the server enforces
            if (!isValidEmail(email)) {
                showToast(t('toast-invalid-email'), 'danger');
                return;
            }
            if (!isValidPassword(password)) {
                showToast(t('toast-invalid-pass'), 'danger');
                return;
            }
            if (!isValidName(first_name)) {
                showToast(t('toast-invalid-first-name'), 'danger');
                return;
            }
            if (!isValidName(last_name)) {
                showToast(t('toast-invalid-last-name'), 'danger');
                return;
            }

            const token = await getRecaptchaToken('signup');

            const response = await fetchWithTimeout('/api/register', {
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
                showToast(apiMessage(data), 'danger');
                return;
            }

            login(data.user);
            setPassword('');
            setEmail('');
            setFirstName('');
            setLastName('');
            showToast(t('toast-signup-success'), 'success');

        } catch (err) {
            showToast(err.message, 'danger');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <h1 ref={headingRef} tabIndex={-1} className="p-0 my-3 text-center">{t('sign-up')}</h1>

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
                        aria-describedby="password-conditions"
                        value={password}
                        minLength={8}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                    />
                    <span id="password-conditions" className="d-flex text-start conditions">{t('conditions')}</span>
                </div>
                <div className="col-10 col-md-8 mb-4">
                    <label htmlFor="first-name" className="form-label mb-0">
                        <span className="h2">{t('first-name')}</span>
                    </label>
                    <input
                        type="text"
                        className="form-control"
                        id="first-name"
                        placeholder={t('first-name-placeholder')}
                        aria-label={t('first-name-aria')}
                        aria-describedby="first-name-conditions"
                        value={first_name}
                        minLength={1}
                        maxLength={50}
                        onChange={(e) => setFirstName(e.target.value)}
                        disabled={isLoading}
                    />
                    <span id="first-name-conditions" className="d-flex text-start conditions">{t('name-conditions')}</span>
                </div>
                <div className="col-10 col-md-8 mb-4">
                    <label htmlFor="last-name" className="form-label mb-0">
                        <span className="h2">{t('last-name')}</span>
                    </label>
                    <input
                        type="text"
                        className="form-control"
                        id="last-name"
                        placeholder={t('last-name-placeholder')}
                        aria-label={t('last-name-aria')}
                        aria-describedby="last-name-conditions"
                        value={last_name}
                        minLength={1}
                        maxLength={50}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={isLoading}
                    />
                    <span id="last-name-conditions" className="d-flex text-start conditions">{t('name-conditions')}</span>
                </div>
            </div>

            <div className="row w-100 d-flex flex-column justify-content-around align-items-center mb-3">
                <div className="col-6 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn btn-sm px-0 filter-btn text-center mb-3"
                        id="sign-up"
                        aria-label={t('sign-up-aria')}
                        onClick={handleSignUp}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center button-span">
                            {isLoading ? t('signing-up') : t('sign-up-button')}
                        </span>
                    </button>
                </div>
                <div className="col-12 col-md-10 d-flex justify-content-center align-items-center">
                    <p className="mb-0 profile-span">
                        {t('have-account')}{' '}
                        <button
                            type="button"
                            className="p-0 m-0 align-baseline profile-btn"
                            aria-label={t('login-link-aria')}
                            onClick={switchToLogin}
                            disabled={isLoading}
                        >
                            {t('login')}
                        </button>
                    </p>
                </div>
            </div>
        </>
    );
};

export default SignUp; 