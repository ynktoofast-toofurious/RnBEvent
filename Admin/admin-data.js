/* Admin runtime config */
window.ADMIN_CONFIG = {
    codeHash: '47d538bc9bbdba86910d104f78b851d87356c7fcee36e214878a5a24f7bbedf4',
    totpKey: [82,78,66,69,86,55,83,69,67,82,51,84,65,68,77,50],
    googleClientId: '1055774009737-vmc62bn3rpcbcpf8h0f6s28kbpvmh359.apps.googleusercontent.com',
    googleAllowedEmails: ['yannicknkongolo7@gmail.com', 'rnbevents716@gmail.com'],
    cloudApiUrl: 'https://k0e4amkowi.execute-api.us-east-2.amazonaws.com',
    prospects: [
        {
            id:        'p1',
            name:      'Sample Prospect',
            email:     'prospect@example.com',
            phone:     '716-555-0100',
            eventType: 'Wedding',
            eventDate: 'June 2027',
            status:    'New Lead',
            notes:     'Reached out via Instagram. Interested in full planning.',
            added:     'April 4, 2026'
        }
    ],
    websiteTasks: [
        {
            id:         't1',
            section:    'Home',
            task:       'Replace hero video with new footage',
            priority:   'High',
            status:     'Pending',
            githubFile: 'index.html'
        },
        {
            id:         't2',
            section:    'Service',
            task:       'Update pricing & package descriptions',
            priority:   'Medium',
            status:     'Pending',
            githubFile: 'service.html'
        },
        {
            id:         't3',
            section:    'Love Book',
            task:       'Add 2026 event photos to gallery',
            priority:   'Medium',
            status:     'Pending',
            githubFile: 'lovebook.html'
        }
    ]
};
