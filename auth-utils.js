
export function authenticateUser() {
    // Request an OAuth token using chrome.identity API
    // Handle authentication success or failure

    //Get the authentication token by having the user login to their google
    return new Promise((resolve, reject) => {chrome.identity.getAuthToken({interactive: true}, (token) => {
        if (chrome.runtime.lastError) {
            console.error("Authenication Failed:", chrome.runtime.lastError.messages);
            reject(chrome.runtime.lastError);
        } else {
            resolve(token);
            }
        });
    });
}

export async function getAccessToken() {
    // Check if a token already exists
    // If not, request a new token using authenticateUser()
    // Return the access token for future API requests
    // console.log("Checking for existing access token");

    //create a promise to see if we can get the token without user login
    try {
        return await new Promise((resolve, reject) => {chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (chrome.runtime.lastError) {
                console.error("Error retrieving token:", chrome.runtime.lastError);
                token = authenticateUser();
                // console.log("Access token retrieved:", token);
                reject(chrome.runtime.lastError);
            } else {
                // console.log("Access token retrieved:", token);
                resolve(token);
            }
            });
        });
    // if failed just have the user login to get the login token
    } catch(error){
        try {
            await authenticateUser();
        } catch (authError){
            console.error("Authentication Failed:", authError);
            throw authError;
        }

    }
}