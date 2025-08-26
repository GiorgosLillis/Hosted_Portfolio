const formatters = {
    temperature: (temp) => `${temp}°C`,
    time: (timestamp) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

export const setBackgroundImage = (imageUrl) => {
    document.body.style.backgroundImage = `url('${imageUrl}')`;
}


export const LoadingIndicator = () => (
    <div className="weather-loading text-center p-5">
        <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-3">Loading weather data...</p>
    </div>
);


export const ErrorMessage = ({ error }) => (
    <div className="weather-error alert alert-danger" role="alert">
        <h4 className="alert-heading">Weather Error</h4>
        <p>{error}</p>
    </div>
);

// The main component that fetches and displays weather data.
export const CurrentWeather = ({ locationInfo, weatherData, lastUpdate }) => (
    <main className="container-fluid p-0">
        <section className="d-flex flex-column align-items-center justify-content-center text-center px-2 px-md-5">
            <h2 className="fs-2 my-2 text-center">
                {locationInfo ? locationInfo.city : 'Loading...'}
            </h2>
            <div className="fs-2 my-2 row d-flex align-items-center justify-content-center col-12 col-lg-9 col-xl-6 gx-0">
                <div className="col-12">
                    <h1 className="display-2">{weatherData.current.temperature}°C</h1>
                </div>
                <div className="col-12 d-flex align-items-center justify-content-center py-1 mb-2">
                    <img
                        src={weatherData.current.icon}
                        alt={weatherData.current.condition}
                        className="weather-icon me-3 py-1 px-0"
                        style={{maxWidth: '60px', height: 'auto'}}
                    />
                    <span className="mx-3">{weatherData.current.condition}</span>
                </div>
                <div className="col-12">
                    <span>Last update: {lastUpdate ? formatters.time(lastUpdate) : 'Unknown'}</span>
                </div>
            </div>
        </section>
    </main>
);

