import { useEffect, useRef } from 'react';

export const useScrollEffect = (disabled) => {
    const ref = useRef(null);

    useEffect(() => {
        const handleScroll = () => {
            if (ref.current && !disabled) {
                const scrollY = window.scrollY;
                const transformValue = `translateX(${scrollY * 0.1}px)`; // Adjust the multiplier for desired effect
                ref.current.style.transform = transformValue;
            } else if (ref.current && disabled) {
                ref.current.style.transform = 'translateX(0px)';
            }
        };

        window.addEventListener('scroll', handleScroll);

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, [disabled]);

    return ref;
};

// Helper functions for displaying states and icons
export const formatters = {
    temperature: (temp, unit) => {
        if (unit === 'celsius') {
            return `${temp.toFixed(1)}°C`;
        }
        const fahrenheit = (temp * 9/5) + 32;
        return `${fahrenheit.toFixed(1)}°F`;
    },
    time: (timestamp) => new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
};

export const setBackgroundImage = (imageUrl) => {
    document.body.style.backgroundImage = `url('${imageUrl}')`;
    
}


export const LoadingIndicator = () => (
    <div className="text-center p-5">
        <div className="spinner-border text-warning" role="status">
            <span className="visually-hidden text-warning">Loading...</span>
        </div>
        <p className="mt-3 text-warning fs-3">Loading weather data...</p>
    </div>
);


export const ErrorMessage = ({ error }) => (
    <h2 className="alert-heading fs-2 mb-3 text-danger" aria-label={error}  role="alert" aria-atomic="true" aria-live="assetive">{error}</h2>
);

export const WarningMessage = ({ warning }) => (
    <h2 className="alert-heading fs-2 mb-3 text-white" aria-label={warning} role="alert" aria-atomic="true" aria-live="polite">{warning}</h2>
);


// Function to get thermometer
export function getThermometer(temp){
    if(temp <= 0){
        return <i className="bi bi-thermometer-snow mx-3"></i>
    }
    else if(temp <=15){
        return <i className="bi bi-thermometer-low mx-3"></i>
    }
    else if(temp <=30){
        return <i className="bi bi-thermometer-half mx-3"></i>
    } 
    else if(temp <=40){
        return <i className="bi bi-thermometer-high mx-3 text-warning"></i>
    }
    else{
         return <i className="bi bi-thermometer-high mx-3 text-danger"></i>
    }
}  

export function getWindDirection (degrees) {
    if (degrees >= 337.5 || degrees < 22.5) {
        return 'N';
    } else if (degrees >= 22.5 && degrees < 67.5) {
        return 'NE';
    } else if (degrees >= 67.5 && degrees < 112.5) {
        return 'E';
    } else if (degrees >= 112.5 && degrees < 157.5) {
        return 'SE';
    } else if (degrees >= 157.5 && degrees < 202.5) {
        return 'S';
    } else if (degrees >= 202.5 && degrees < 247.5) {
        return 'SW';
    } else if (degrees >= 247.5 && degrees < 292.5) {
        return 'W';
    } else { // 292.5 - 337.5
        return 'NW';
    }
};

const warningIcon = <i className="bi bi-exclamation-triangle-fill text-warning mx-1 mx-lg-2"></i>;
const dangerIcon = <i className="bi bi-exclamation-triangle-fill text-danger mx-1 mx-lg-2"></i>;

export function getHumidityWaring(humidity){
    if (humidity >= 60){
        return warningIcon;
    }
}

export function getWindSpeedWarning(windspeed) {                                                                                                  
    if (windspeed > 48) {                                                                                                                         
       return warningIcon;                                                   
    }        
    else if (windspeed > 88){
       return dangerIcon; 
    }                                                                                                                                    
    return null;                                                                                                                                  
}                                                                                                                                                                                                                                                                                              
                                                                                                                                                
export function getUvIndexWarning(uvIndex) {                                                                                                      
    if (uvIndex >= 6 && uvIndex <= 7) {                                                                                                                           
       return warningIcon;                                                  
    }          
    else if (uvIndex >= 8){
        return dangerIcon;
    }

    return null;                                                                                                                                 
}                                                                                                                                                 
                                                                                                                                                 
export function getPM10Warning(PM10) {                                                                                                       
    if (PM10 >= 101 && PM10 <= 150) {                                                                                                                             
        return warningIcon;                                                     
    }                            
    else if (PM10 > 150){
        return dangerIcon;
    }                                                                                                                 
    return null;                                                                                                                                  
}      

export function getPM2_5Warning(PM2_5) {                                                                                                       
    if (PM2_5 >= 56 && PM2_5 <= 150) {                                                                                                                             
        return warningIcon;                                                     
    }                            
    else if (PM2_5 > 150){
        return dangerIcon;
    }                                                                                                                 
    return null;                                                                                                                                  
} 

export function getCarbonMonoxideWarning(C0) {                                                                                                       
    if (C0 >= 35 && C0 <= 200) {                                                                                                                             
        return warningIcon;                                                     
    }                            
    else if (C0 > 200){
        return dangerIcon;
    }                                                                                                                 
    return null;                                                                                                                                  
} 

export function getNitrogenDioxideWarning(N02) {                                                                                                       
    if (N02 >= 200) {                                                                                                                             
        return dangerIcon;                                                     
    }                                                                                                                                           
    return null;                                                                                                                                  
} 

export function getOzoneWarning(O3) {                                                                                                       
    if (O3 >= 101 && O3 <= 150) {                                                                                                                             
        return warningIcon;                                                     
    }                            
    else if (O3 > 150){
        return dangerIcon;
    }                                                                                                                 
    return null;                                                                                                                                  
} 

export function getSulphurDioxideWarning(SO2) {                                                                                                       
    if (SO2 >= 1 && SO2 <= 5) {                                                                                                                             
        return warningIcon;                                                     
    }                            
    else if (SO2 > 20){
        return dangerIcon;
    }                                                                                                                 
    return null;                                                                                                                                  
} 

export function isFavorite  (city, country, favorites) {
    if (!city || !country) return false;
    return favorites.some(fav => fav.city.toLowerCase() === city.toLowerCase() && fav.country.toLowerCase() === country.toLowerCase());
};

 
export function addToFavorites (location, favorites,  setFavorites){
    const updatedFavorites = [...favorites, location];
    setFavorites(updatedFavorites);
    localStorage.setItem('favoriteLocations', JSON.stringify(updatedFavorites));
};

 
export function removeFromFavorites (location, favorites, setFavorites){
    const updatedFavorites = favorites.filter(fav => fav.city.toLowerCase() !== location.city.toLowerCase() || fav.country.toLowerCase() !== location.country.toLowerCase());
    setFavorites(updatedFavorites);
    localStorage.setItem('favoriteLocations', JSON.stringify(updatedFavorites));
};