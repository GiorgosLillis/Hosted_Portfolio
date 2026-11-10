import React, { useState, useEffect, useRef } from "react";
import { useAuth } from './auth.jsx';
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';
import { isValidEmail, isValidPassword, isValidName } from '../common/validation.js';
import { fetchWithTimeout } from '../common/fetchWithTimeout.js';
import { useTranslation } from 'react-i18next';
import { apiMessage } from '../common/i18n.js';

const ProfileEdit = ({ switchToLogout, showToast }) => {

    const { user } = useAuth();
    const { t, i18n } = useTranslation();
    const headingRef = useRef(null);
    const [originalData, setOriginalData] = useState({});
    const [id, setId] = useState('');
    const [email, setEmail] = useState('');
    const [current_password, setCurrent_Password] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [createdAt, setcreatedAt] = useState('');
    const cre = new Date(createdAt).toLocaleDateString(i18n.language === 'el' ? 'el-GR' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    // Which action is in flight 
    const [loadingAction, setLoadingAction] = useState(null);
    const isLoading = loadingAction !== null;
    const [deleteConfirm, setdeleteConfirm] = useState(false);

    // Prefill the form with the logged-in user's current data
    useEffect(() => {
        headingRef.current?.focus();
    }, []);

    useEffect(() => {
        loadRecaptchaScript();
        if (user) {
            const initialData = {
                id: user.id || '',
                email: user.email || '',
                firstName: user.firstName || '',
                lastName: user.lastName || '',
            };

            setId(initialData.id);
            setEmail(initialData.email);
            setFirstName(initialData.firstName);
            setLastName(initialData.lastName);
            setcreatedAt(user.createdAt || '');
            setOriginalData(initialData);
        }
    }, [user]);

    // A 401 means the token itself is dead (e.g. "log out everywhere")
    const handleUnauthorized = (response, result) => {
        if (response.status === 401) {
            showToast(t('toast-session-expired'), 'danger');
            switchToLogout();
            return true;
        }
        showToast(apiMessage(result), 'danger');
        return false;
    };

    const handleEdit = async () => {
        setLoadingAction('edit');
        try {
            const currentData = { email, firstName, lastName, createdAt };
            const hasDataChanges = JSON.stringify(originalData) !== JSON.stringify(currentData);
            const hasPasswordChange = password.length > 0;
            const currentPasswordProvided = current_password.length > 0;

            if ((!hasDataChanges && !hasPasswordChange)) {
                showToast(t('toast-no-changes'), 'info');
                setLoadingAction(null);
                return;
            }
            // The current password is always required to make any change
            if (!currentPasswordProvided) {
                showToast(t('toast-current-pass'), 'danger');
                setLoadingAction(null);
                return;
            }

            if (email && !isValidEmail(email)) {
                showToast(t('toast-invalid-email'), 'danger');
                return;
            }
            if (current_password && !isValidPassword(current_password)) {
                showToast(t('toast-invalid-pass'), 'danger');
                return;
            }
            if (password && !isValidPassword(password)) {
                showToast(t('toast-invalid-pass'), 'danger');
                return;
            }
            if (firstName && !isValidName(firstName)) {
                showToast(t('toast-invalid-first-name'), 'danger');
                return;
            }
            if (lastName && !isValidName(lastName)) {
                showToast(t('toast-invalid-last-name'), 'danger');
                return;
            }

            const token = await getRecaptchaToken('edit');

            const payload = {
                id,
                email,
                current_password,
                first_name: firstName,
                last_name: lastName
            };

            if (hasPasswordChange) {
                payload.password = password;
            }

            const response = await fetchWithTimeout('/api/edit', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'g-recaptcha-response': token
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();
            if (!response.ok) {
                if (data.code === 'invalid-password') setCurrent_Password('');
                handleUnauthorized(response, data);
                return;
            }

            setOriginalData({
                email: payload.email,
                firstName: payload.firstName,
                lastName: payload.lastName,
                createdAt: createdAt
            });
            setPassword('');
            setCurrent_Password('');
            showToast(t('toast-edit-success'), 'success');

        } catch (err) {
            showToast(err.message, 'danger');
        } finally {
            setLoadingAction(null);
        }
    };

    const handleExport = async () => {
        setLoadingAction('export');

        try {
            const token = await getRecaptchaToken('export');

            const response = await fetchWithTimeout('/api/export', {
                method: 'GET',
                headers: {
                    'g-recaptcha-response': token
                },
            });

            const result = await response.json();
            if (!response.ok) {
                handleUnauthorized(response, result);
                return;
            }

            const exportData = result.data;
            downloadBlob(new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }), 'my-data.json');
            downloadBlob(new Blob(['\uFEFF' + toCsv(exportData)], { type: 'text/csv;charset=utf-8' }), 'my-data.csv');
            showToast(t('toast-export-success'), 'success');
        } catch (err) {
            showToast(err.message, 'danger');
        } finally {
            setLoadingAction(null);
        }
    }

    const downloadBlob = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const escapeCsvField = (value) => {
        const str = String(value ?? '');
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const toCsv = ({ profile, favoriteCities, shoppingList }) => {
        const lines = ['sep=,'];
        lines.push('Profile', ['Email', 'First Name', 'Last Name', 'Created At'].join(','));
        lines.push([profile.email, profile.firstName, profile.lastName, profile.createdAt].map(escapeCsvField).join(','), '');

        lines.push('Favorite Cities', ['Name', 'Country', 'Latitude', 'Longitude'].join(','));
        favoriteCities.forEach(c => lines.push([c.name, c.country, c.latitude, c.longitude].map(escapeCsvField).join(',')));
        lines.push('');

        lines.push('Shopping List', ['Item', 'Quantity', 'Unit', 'Category', 'Purchased'].join(','));
        shoppingList.forEach(i => lines.push([i.name, i.quantity, i.measure, i.category, i.isPurchased ? 'Yes' : 'No'].map(escapeCsvField).join(',')));

        return lines.join('\n');
    };

    // Called only after the delete button has already been clicked once (the "Confirm?" state below)
    const handleDelete = async () => {
        if (current_password === '') {
            showToast(t('toast-type-pass'), 'danger');
            return;
        }

        setLoadingAction('delete');
        try {
            const token = await getRecaptchaToken('delete');

            const response = await fetchWithTimeout('/api/deleteUser', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'g-recaptcha-response': token
                },
                body: JSON.stringify({
                    password: current_password
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                if (data.code === 'invalid-password') setCurrent_Password('');
                handleUnauthorized(response, data);
                return;
            }

            showToast(t('toast-delete-success'), 'success');
            switchToLogout();
        } catch (err) {
            showToast(err.message, 'danger');
        } finally {
            setLoadingAction(null);
        }
    };

    // Tracked like every other action so the rest of the buttons are disabled until the logout finishes
    const handleLogout = async () => {
        setLoadingAction('logout');
        await switchToLogout();
    };

    const handleLogoutDevices = async () => {
        try {
            setLoadingAction('logoutDevices');

            const token = await getRecaptchaToken('logoutDevices');

            const response = await fetchWithTimeout('/api/logoutDevices', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'g-recaptcha-response': token
                }
            });

            const data = await response.json();
            if (!response.ok) {
                handleUnauthorized(response, data);
                return;
            }

            showToast(t('toast-logout-others-success'), 'success');
        } catch (err) {
            showToast(err.message, 'danger');
        } finally {
            setLoadingAction(null);
        }
    }

    if (isLoading && Object.keys(originalData).length === 0) {
        return <h1 className="text-center my-5">{t('loading-profile')}</h1>;
    }

    return (
        <>
            <h1 ref={headingRef} tabIndex={-1} className="p-0 my-3 text-center">{t('edit-profile')}</h1>

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
                    <label htmlFor="current_password" className="form-label mb-0">
                        <span className="h2">{t('current-pass')}</span>
                    </label>
                    <input
                        type="password"
                        className="form-control"
                        id="current_password"
                        placeholder="*********"
                        aria-label={t('current-pass-aria')}
                        value={current_password}
                        minLength={8}
                        onChange={(e) => setCurrent_Password(e.target.value)}
                        disabled={isLoading}
                    />
                </div>
                <div className="col-10 col-md-8 mb-4">
                    <label htmlFor="password" className="form-label mb-0">
                        <span className="h2">{t('change-pass')}</span>
                    </label>
                    <input
                        type="password"
                        className="form-control"
                        id="password"
                        placeholder="*********"
                        aria-label={t('change-pass-aria')}
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
                        value={firstName}
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
                        value={lastName}
                        minLength={1}
                        maxLength={50}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={isLoading}
                    />
                    <span id="last-name-conditions" className="d-flex text-start conditions">{t('name-conditions')}</span>
                </div>
                <div className="col-10 col-md-8 mb-4">
                    {createdAt && <h5>{t('created-at', { date: cre })}</h5>}
                </div>
            </div>

            <div className="row w-100 d-flex flex-wrap justify-content-center align-items-center mb-3">
                <div className="col-12 col-sm-6 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn px-0 controls text-center mb-3 btn-primary"
                        id="edit"
                        aria-label={t('edit-aria')}
                        onClick={handleEdit}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center button-span">
                            {loadingAction === 'edit' ? t('editing') : t('edit-button')}
                        </span>
                    </button>
                </div>
                <div className="col-12 col-sm-6 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn px-0 controls text-center mb-3 btn-primary"
                        id="export"
                        aria-label={t('export-aria')}
                        onClick={handleExport}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center button-span">
                            {loadingAction === 'export' ? t('exporting') : t('export-button')}
                        </span>
                    </button>
                </div>
                <div className="col-12 col-sm-6 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn px-0 controls text-center mb-3 btn-danger"
                        id="log-out"
                        aria-label={t('logout-device-aria')}
                        onClick={handleLogout}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center button-span">
                            {loadingAction === 'logout' ? t('logging-out') : t('logout-device')}
                        </span>
                    </button>
                </div>
                <div className="col-12 col-sm-6 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn px-0 controls text-center mb-3 btn-danger"
                        id="log-out-devices"
                        aria-label={t('logout-others-aria')}
                        onClick={handleLogoutDevices}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center button-span">
                            {loadingAction === 'logoutDevices' ? t('logging-out') : t('logout-others')}
                        </span>
                    </button>
                </div>
                <div className="col-12 col-sm-6 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn px-0 controls text-center mb-3 btn-danger"
                        id="delete"
                        aria-label={deleteConfirm ? t('delete-confirm-aria') : t('delete-aria')}
                        onClick={() => deleteConfirm ? handleDelete() : setdeleteConfirm(true)}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center button-span">
                            {loadingAction === 'delete' ? t('deleting') : (deleteConfirm ? t('delete-confirm') : t('delete-button'))}
                        </span>
                    </button>
                </div>
            </div>
        </>
    );
};

export default ProfileEdit;