import React, { useState, useEffect } from "react";
import { useAuth } from './auth.jsx'; 

const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const nameRegex = /^[a-zA-Z'-]{1,50}$/;

const ProfileEdit = ({ switchToLogout, showToast }) => {

    const { user} = useAuth();
    const [originalData, setOriginalData] = useState({});
    const [id, setId] = useState('');
    const [email, setEmail] = useState('');
    const [current_password, setCurrent_Password] = useState('');
    const [password, setPassword] = useState('');
    const [first_name, setFirstName] = useState('');
    const [last_name, setLastName] = useState('');
    const [created_at, setCreated_At] = useState('');
    const cre = new Date(created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        // Only run if the global user object is present
        if (user) {
            const initialData = {
                id: user.id || '',
                email: user.email || '',
                first_name: user.firstName || '', 
                last_name: user.lastName || '',
            };

            setId(initialData.id);
            setEmail(initialData.email);
            setFirstName(initialData.first_name);
            setLastName(initialData.last_name);
            setCreated_At(user.created_at || '');
            setOriginalData(initialData); 
        }
    }, [user]); 

    const handleEdit = async () => {
        setIsLoading(true);

        try {

            const currentData = { email, first_name, last_name };
            const hasDataChanges = JSON.stringify(originalData) !== JSON.stringify(currentData);
            const hasPasswordChange = password.length > 0;
            if (!hasDataChanges && !hasPasswordChange) {
                showToast('No changes detected.', 'info');
                setIsLoading(false);
                return; 
            }

            if (email && !emailRegex.test(email)) {
                throw new Error('Please enter a valid email address');
            } 
            if (current_password && !passwordRegex.test(current_password)) {
                throw new Error('Password must be at least 8 characters long and include uppercase, lowercase, number, and special character');
            }
            if (password && !passwordRegex.test(password)) {
                throw new Error('Password must be at least 8 characters long and include uppercase, lowercase, number, and special character');
            }
            if (first_name && !nameRegex.test(first_name)) {
                throw new Error('Please enter a valid first name (1-50 characters, letters, hyphens, apostrophes only)');
            }
            if (last_name && !nameRegex.test(last_name)) {
                throw new Error('Please enter a valid last name (1-50 characters, letters, hyphens, apostrophes only)');
            }

            const payload = { 
                id,
                email, 
                current_password,
                first_name, 
                last_name
            };
            if (hasPasswordChange) {
                payload.password = password;
            }

            const response = await fetch('/api/edit', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Something went wrong');
            }

             setOriginalData({
                email: payload.email,
                first_name: payload.first_name,
                last_name: payload.last_name,
                created_at: created_at
            });
            setPassword(''); // Clear the password field after a successful change  
            setCurrent_Password(''); // Clear the current password field after a successful change
            showToast('Edit successful!', 'success');

        } catch (err) {
            showToast(err.message, 'danger');
        } finally {
            setIsLoading(false);
        }
    };

     if (isLoading && Object.keys(originalData).length === 0) {
        return <h1 className="text-center my-5">Loading Profile Data...</h1>;
    }

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
                    <label htmlFor="current-password" className="form-label mb-0">
                        <h2>Current Password</h2>
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
                        <h2>Change Password</h2>
                    </label>
                    <input
                        type="password" 
                        className="form-control"
                        id="password"
                        placeholder="*********"
                        aria-label="Write your new password here"
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
                <div className="col-10 col-md-8 mb-4">
                    <h5>Profile created at: {cre}</h5>
                </div>
            </div>

            <div className="row w-100 d-flex justify-content-around align-items-center mb-3">
                <div className="col-5 d-flex justify-content-center align-items-center px-0">
                    <button
                        type="button"
                        className="btn btn-sm px-0 filter-btn text-center mb-3"
                        id="edit"
                        aria-label="Edit your profile"
                        onClick={handleEdit}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center">
                            {isLoading ? 'Editing...' : 'Edit'}
                        </span>
                    </button>
                </div>
                <div className="col-5 d-flex justify-content-center align-items-center px-0">
                    <button
                        type="button"
                        className="btn btn-sm px-0 filter-btn text-center mb-3"
                        id="log-out"
                        aria-label="Log out of your account"
                        onClick={switchToLogout}
                        disabled={isLoading}
                    >
                        <span className="d-flex text-center justify-content-center">
                            {isLoading ? 'Logout...' : 'Logout'}
                        </span>
                    </button>
                </div>
            </div>
        </>
    );
};

export default ProfileEdit; 