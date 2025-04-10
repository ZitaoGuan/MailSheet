import { getAccessToken } from './auth-utils.js';


async function exportTosheet(Usersheet = null){
    try {
        const token = await getAccessToken();
        let spreadsheet = null;
        if (Usersheet){
            const response = await fetch (`https://sheets.googleapis.com/v4/spreadsheets/${userSheetId}`, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                }
            });
            spreadsheet = await response.json();

        } else {
            const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  properties: {
                    title: 'My Job Applications'
                },
                sheets: [
                {
                    properties: {
                    title: 'Job Applications',
                    gridProperties: {
                        frozenRowCount: 1 // This freezes the header row
                    }
                    }
                }
                ]
            })
            });

            spreadsheet = await response.json();
        }
        
        return spreadsheet;

    } catch (error) {
        console.error("Error:", error);
    }
}

function getAllJobApplication(){
    return new Promise((resolve) => {
        chrome.storage.local.get('JobApplicationIndex', function(result) {
        const index = result.JobApplicationIndex || [];
        if (index.length === 0){
            resolve([]);
            return;
        }

        chrome.storage.local.get(index, function(app) {
            const allJob = index.map(keys => app[keys]);
            resolve(allJob);
            });
        });
    });
}

document.getElementById('exportBtn').addEventListener('click', async () => {
    const jobs = await getAllJobApplication();
    console.log("Exported Jobs:", jobs);
    });
