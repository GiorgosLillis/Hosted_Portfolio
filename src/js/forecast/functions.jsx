import { useEffect, useRef, useState } from 'react';
import i18next from '../common/i18n.js';
import { isSameLocation } from '../weather/location-match.js';
import { PLACE_NAMES_EVENT, localName } from '../weather/place-names.js';

// "City, Region, Country" in the active language, the region is left out when it is unknown or just repeats the city or the country
export const formatPlace = (place) => {
    const { city, region, country } = localName(place);
    const showRegion = region && region !== city && region !== country;
    return [city, showRegion && region, country].filter(Boolean).join(', ');
};

// Re-renders the component whenever a translated place name arrives
export const usePlaceNames = () => {
    const [, setVersion] = useState(0);

    useEffect(() => {
        const refresh = () => setVersion((version) => version + 1);
        window.addEventListener(PLACE_NAMES_EVENT, refresh);
        return () => window.removeEventListener(PLACE_NAMES_EVENT, refresh);
    }, []);
};

// Parallax-style effect, shifts an element horizontally as the page scrolls
export const useScrollEffect = (disabled) => {
    const ref = useRef(null);

    useEffect(() => {
        const handleScroll = () => {
            if (ref.current && !disabled) {
                const scrollY = window.scrollY;
                const transformValue = `translateX(${scrollY * 0.1}px)`;
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
        const fahrenheit = (temp * 9 / 5) + 32;
        return `${fahrenheit.toFixed(1)}°F`;
    },
    time: (timestamp) => new Date(timestamp).toLocaleTimeString(i18next.language, { hour: '2-digit', minute: '2-digit' }),
};

export const setBackgroundImage = (imageUrl) => {
    document.body.style.backgroundImage = `url('${imageUrl}')`;

}


export const LoadingIndicator = () => (
    <div className="d-flex flex-column justify-content-center align-items-center vh-100 p-5" aria-label={i18next.t('fc-loading')}>
        <div className="spinner-border text-warning" role="status">
            <span className="visually-hidden text-warning">{i18next.t('loading')}</span>
        </div>
        <p className="mt-3 text-warning fs-3">{i18next.t('fc-loading')}</p>
    </div>
);


export const ErrorMessage = ({ error }) => (
    <h2 className="alert-heading fs-2 mb-3 text-danger text-center" aria-label={error} role="alert" aria-atomic="true" aria-live="assertive">{error}</h2>
);

export const WarningMessage = ({ warning }) => (
    <h2 className="alert-heading fs-2 mb-3 text-white text-center" aria-label={warning} role="alert" aria-atomic="true" aria-live="polite">{warning}</h2>
);


export function getThermometer(temp) {
    // Chooses the right temperature icin
    if (temp <= 0) {
        return <i className="bi bi-thermometer-snow mx-3" aria-hidden="true"></i>
    }
    else if (temp <= 15) {
        return <i className="bi bi-thermometer-low mx-3" aria-hidden="true"></i>
    }
    else if (temp <= 30) {
        return <i className="bi bi-thermometer-half mx-3" aria-hidden="true"></i>
    }
    else if (temp <= 40) {
        return <i className="bi bi-thermometer-high mx-3 text-warning" aria-hidden="true"></i>
    }
    else {
        return <i className="bi bi-thermometer-high mx-3 text-danger" aria-hidden="true"></i>
    }
}

export function getWindDirection(degrees) {
    let direction;
    if (degrees >= 337.5 || degrees < 22.5) {
        direction = 'n';
    } else if (degrees >= 22.5 && degrees < 67.5) {
        direction = 'ne';
    } else if (degrees >= 67.5 && degrees < 112.5) {
        direction = 'e';
    } else if (degrees >= 112.5 && degrees < 157.5) {
        direction = 'se';
    } else if (degrees >= 157.5 && degrees < 202.5) {
        direction = 's';
    } else if (degrees >= 202.5 && degrees < 247.5) {
        direction = 'sw';
    } else if (degrees >= 247.5 && degrees < 292.5) {
        direction = 'w';
    } else {
        direction = 'nw';
    }
    return i18next.t(`fc-wind-${direction}`);
};


// Built per call (not module constants) so the aria-label follows the current language
const warningIcon = () => <i className="bi bi-exclamation-triangle-fill text-warning mx-1 mx-lg-2" role="img" aria-label={i18next.t('fc-level-warning')}></i>;
const dangerIcon = () => <i className="bi bi-exclamation-triangle-fill text-danger mx-1 mx-lg-2" role="img" aria-label={i18next.t('fc-level-danger')}></i>;

// One threshold-check function per metric
export function getHumidityWaring(humidity) {
    if (humidity >= 60) {
        return warningIcon();
    }
}

export function getWindSpeedWarning(windspeed) {
    if (windspeed > 48 && windspeed < 88) {
        return warningIcon();
    }
    else if (windspeed > 88) {
        return dangerIcon();
    }
    return null;
}

export function getUvIndexWarning(uvIndex) {
    if (uvIndex >= 6 && uvIndex <= 7) {
        return warningIcon();
    }
    else if (uvIndex >= 8) {
        return dangerIcon();
    }

    return null;
}

export function getPM10Warning(PM10) {
    if (PM10 >= 101 && PM10 <= 150) {
        return warningIcon();
    }
    else if (PM10 > 150) {
        return dangerIcon();
    }
    return null;
}

export function getPM2_5Warning(PM2_5) {
    if (PM2_5 >= 56 && PM2_5 <= 150) {
        return warningIcon();
    }
    else if (PM2_5 > 150) {
        return dangerIcon();
    }
    return null;
}

export function getCarbonMonoxideWarning(C0) {
    if (C0 >= 35 && C0 <= 200) {
        return warningIcon();
    }
    else if (C0 > 200) {
        return dangerIcon();
    }
    return null;
}

export function getNitrogenDioxideWarning(N02) {
    if (N02 >= 200) {
        return dangerIcon();
    }
    return null;
}

export function getOzoneWarning(O3) {
    if (O3 >= 101 && O3 <= 150) {
        return warningIcon();
    }
    else if (O3 > 150) {
        return dangerIcon();
    }

    return null;
}

export function getSulphurDioxideWarning(SO2) {
    if (SO2 >= 1 && SO2 <= 5) {
        return warningIcon();
    }
    else if (SO2 > 20) {
        return dangerIcon();
    }
    return null;
}

// Whether the location is already in the favorites list, matched by coordinates so a language change doesn't break it
export function isFavorite(location, favorites) {
    if (!location || !favorites) return false;
    return favorites.some(fav => isSameLocation(fav, location));
};
