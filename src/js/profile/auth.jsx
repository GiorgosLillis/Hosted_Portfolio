// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode'; // A popular library for decoding JWTs

// Create the context object
const AuthContext = createContext(null);

// Custom hook to use the context easily
export const useAuth = () => useContext(AuthContext);

// Provider component to wrap your application
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const decodedToken = jwtDecode(token);
                const currentTime = Date.now() / 1000;
                if (decodedToken.exp > currentTime) {
                    // Token is valid, set user from decoded data
                    setUser({ id: decodedToken.userId, email: decodedToken.email });
                } else {
                    // Token is expired
                    localStorage.removeItem('token');
                }
            } catch (error) {
                console.error("Error decoding token:", error);
                localStorage.removeItem('token');
            }
        }
    }, []);

    const login = (userData, token) => {
        localStorage.setItem('token', token);
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
    };

    const isAuthenticated = !!user;

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};