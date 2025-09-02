// Helper functions for displaying states and icons
export const formatters = {
    temperature: (temp) => `${temp}°C`,
    time: (timestamp) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
    <h2 className="alert-heading fs-2 mb-3 text-danger">{error}</h2>
);

export const WarningMessage = ({ warning }) => (
    <h2 className="alert-heading fs-2 mb-3 text-white">{warning}</h2>
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

const warningIcon = <i className="bi bi-exclamation-triangle-fill text-warning mx-2"></i>;
const dangerIcon = <i className="bi bi-exclamation-triangle-fill text-danger mx-2"></i>;

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