// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';

// Create the context object
const AuthContext = createContext(null);

// Custom hook to use the context easily
export const useAuth = () => useContext(AuthContext);

// Provider component to wrap your application
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // On first load, ask the server if the cookie is still valid, this is how a refresh keeps you logged in
    useEffect(() => {
        fetch('/api/user')
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
                throw new Error('User not authenticated');
            })
            .then(data => {
                setUser(data.user);
            })
            .catch(error => {
                console.error("Error fetching user:", error);
                setUser(null);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, []);

    const login = (userData) => {
        setUser(userData);
    };

    // Clears the cookie server-side, and clears local state regardless of whether that call succeeds
    const logout = () => {
        fetch('/api/logout')
            .catch(error => {
                console.error('Logout failed:', error);
            })
            .finally(() => {
                setUser(null);
                localStorage.removeItem('accountShoppingList');
                localStorage.removeItem('accountFavoriteLocations');
            });
    };

    const isAuthenticated = !!user;

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, login, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};