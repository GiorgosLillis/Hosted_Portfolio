import React, { useState, useEffect, useRef } from "react";
import { useAuth } from './auth.jsx';
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';
import { isValidEmail, isValidPassword, isValidName } from '../common/validation.js';

const ProfileEdit = ({ switchToLogout, showToast }) => {

    const { user } = useAuth();
    const headingRef = useRef(null);
    const [originalData, setOriginalData] = useState({});
    const [id, setId] = useState('');
    const [email, setEmail] = useState('');
    const [current_password, setCurrent_Password] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [createdAt, setcreatedAt] = useState('');
    const cre = new Date(createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
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
            showToast('Your session has expired. Please log in again.', 'danger');
            switchToLogout();
            return true;
        }
        showToast(result.message, 'danger');
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
                showToast('No changes detected.', 'info');
                setLoadingAction(null);
                return;
            }
            // The current password is always required to make any change
            if (!currentPasswordProvided) {
                showToast('Type your current password.', 'danger');
                setLoadingAction(null);
                return;
            }

            if (email && !isValidEmail(email)) {
                showToast('Please enter a valid email address', 'danger');
                return;
            }
            if (current_password && !isValidPassword(current_password)) {
                showToast('Password must be at least 8 characters long and include uppercase, lowercase, number, and special character', 'danger');
                return;
            }
            if (password && !isValidPassword(password)) {
                showToast('Password must be at least 8 characters long and include uppercase, lowercase, number, and special character', 'danger');
                return;
            }
            if (firstName && !isValidName(firstName)) {
                showToast('Please enter a valid first name (1-50 characters, letters, hyphens, apostrophes only)', 'danger');
                return;
            }
            if (lastName && !isValidName(lastName)) {
                showToast('Please enter a valid last name (1-50 characters, letters, hyphens, apostrophes only)', 'danger');
                return;
            }

            const token = await getRecaptchaToken('edit');

            const payload = {
                id,
                email,
                current_password,
                firstName,
                lastName
            };

            if (hasPasswordChange) {
                payload.password = password;
            }

            const response = await fetch('/api/edit', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'g-recaptcha-response': token
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();
            if (!response.ok) {
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
            showToast('Edit successful!', 'success');

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

            const response = await fetch('/api/export', {
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
            showToast('An export of account data had been downloaded.', 'success');
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
            showToast('Type your password.', 'danger');
            return;
        }

        setLoadingAction('delete');
        try {
            const token = await getRecaptchaToken('delete');

            const response = await fetch('/api/deleteUser', {
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
                handleUnauthorized(response, data);
                return;
            }

            showToast('Account deleted successfully.', 'success');
            switchToLogout();
        } catch (err) {
            showToast(err.message, 'danger');
        } finally {
            setLoadingAction(null);
        }
    };

    const handleLogoutDevices = async () => {
        try {
            setLoadingAction('logoutDevices');

            const token = await getRecaptchaToken('logoutDevices');

            const response = await fetch('/api/logoutDevices', {
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

            showToast('Logged out of the other devices.', 'success');
        } catch (err) {
            showToast(err.message, 'danger');
        } finally {
            setLoadingAction(null);
        }
    }

    if (isLoading && Object.keys(originalData).length === 0) {
        return <h1 className="text-center my-5">Loading Profile Data...</h1>;
    }

    return (
        <>
            <h1 ref={headingRef} tabIndex={-1} className="p-0 my-3 text-center">Edit Profile</h1>

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
                    <label htmlFor="current_password" className="form-label mb-0">
                        <span className="h2">Current Password</span>
                    </label>
                    <input
                        type="password"
                        className="form-control"
                        id="current_password"
                        placeholder="*********"
                        aria-label="Write your current password here"
                        value={current_password}
                        minLength={8}
                        onChange={(e) => setCurrent_Password(e.target.value)}
                        disabled={isLoading}
                    />
                </div>
                <div className="col-10 col-md-8 mb-4">
                    <label htmlFor="password" className="form-label mb-0">
                        <span className="h2">Change Password</span>
                    </label>
                    <input
                        type="password"
                        className="form-control"
                        id="password"
                        placeholder="*********"
                        aria-label="Write your new password here"
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
                        value={firstName}
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
                        value={lastName}
                        minLength={1}
                        maxLength={50}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={isLoading}
                    />
                    <span id="last-name-conditions" className="d-flex text-start conditions">At most 50 characters long</span>
                </div>
                <div className="col-10 col-md-8 mb-4">
                    <h5>Profile created at: {cre}</h5>
                </div>
            </div>

            <div className="row w-100 d-flex flex-wrap justify-content-center align-items-center mb-3">
                <div className="col-12 col-sm-6 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn px-0 controls text-center mb-3 btn-primary"
                        id="edit"
                        aria-label="Edit your profile"
                        onClick={handleEdit}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center button-span">
                            {loadingAction === 'edit' ? 'Editing...' : 'Edit account info'}
                        </span>
                    </button>
                </div>
                <div className="col-12 col-sm-6 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn px-0 controls text-center mb-3 btn-primary"
                        id="export"
                        aria-label="Export your account data"
                        onClick={handleExport}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center button-span">
                            {loadingAction === 'export' ? 'Exporting...' : 'Export account info'}
                        </span>
                    </button>
                </div>
                <div className="col-12 col-sm-6 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn px-0 controls text-center mb-3 btn-danger"
                        id="log-out"
                        aria-label="Log out of your account"
                        onClick={switchToLogout}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center button-span">
                            Logout from this device
                        </span>
                    </button>
                </div>
                <div className="col-12 col-sm-6 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn px-0 controls text-center mb-3 btn-danger"
                        id="log-out-devices"
                        aria-label="Log out of other devices"
                        onClick={handleLogoutDevices}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center button-span">
                            {loadingAction === 'logoutDevices' ? 'Logging out...' : 'Logout from other devices'}
                        </span>
                    </button>
                </div>
                <div className="col-12 col-sm-6 d-flex justify-content-center align-items-center">
                    <button
                        type="button"
                        className="btn px-0 controls text-center mb-3 btn-danger"
                        id="delete"
                        aria-label={deleteConfirm ? 'Confirm account deletion' : 'Delete your account'}
                        onClick={() => deleteConfirm ? handleDelete() : setdeleteConfirm(true)}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center button-span">
                            {loadingAction === 'delete' ? 'Deleting...' : (deleteConfirm ? 'Are you sure?' : 'Delete account')}
                        </span>
                    </button>
                </div>
            </div>
        </>
    );
};

export default ProfileEdit;