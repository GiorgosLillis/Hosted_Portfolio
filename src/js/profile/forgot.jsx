import React, { useState, useEffect, useRef } from "react";
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';
import { isValidEmail } from '../common/validation.js';
import { fetchWithTimeout } from '../common/fetchWithTimeout.js';
import { useTranslation } from 'react-i18next';
import { apiMessage } from '../common/i18n.js';

const Forgot = ({ switchToLogin, showToast }) => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const headingRef = useRef(null);
    const { t } = useTranslation();

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
                throw new Error(t('toast-invalid-email'));
            }

            const token = await getRecaptchaToken('forgot');

            const response = await fetchWithTimeout('/api/forgot', {
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
                throw new Error(apiMessage(data, t('toast-something-wrong')));
            }

            showToast(apiMessage(data), 'success');
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
                <h1 ref={headingRef} tabIndex={-1} className="p-0 my-3 text-center">{t('check-email')}</h1>
                <p className="mb-3 profile-span text-center col-10 col-md-8 mx-auto">
                    {t('check-email-text')}
                </p>
                <div className="row w-100 d-flex justify-content-around align-items-center mb-3">
                    <div className="col-6 d-flex justify-content-center align-items-center">
                        <button
                            type="button"
                            className="btn btn-sm px-0 filter-btn text-center mb-3"
                            aria-label={t('back-to-login-aria')}
                            onClick={switchToLogin}
                        >
                            <span className="d-flex text-center justify-content-center button-span">
                                {t('back-to-login')}
                            </span>
                        </button>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <h1 ref={headingRef} tabIndex={-1} className="p-0 my-3 text-center">{t('forgot-title')}</h1>

            <div className="row p-0 mb-3 w-100 d-flex justify-content-around align-items-center" id="list-form">
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
            </div>

            <div className="row w-100 d-flex flex-column justify-content-around align-items-center mb-3">
                <div className="col-12 col-md-6 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn btn-sm px-0 filter-btn text-center mb-3"
                        aria-label={t('send-link-aria')}
                        onClick={handleForgot}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center button-span">
                            {isLoading ? t('sending') : t('send-link')}
                        </span>
                    </button>
                </div>
                <div className="col-12 col-md-10 d-flex justify-content-center align-items-center">
                    <p className="mb-0 profile-span">
                        {t('remembered')}{' '}
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
}

export default Forgot; 