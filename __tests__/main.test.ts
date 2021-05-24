import {findMilestone} from '../src/main'

test('findMilestone', async () => {
    const milestones = [
        {
            "number": 20,
            "title": "13th Sprint - Platform team",
            "description": "",
            "open_issues": 9,
            "closed_issues": 19,
            "state": "open",
            "created_at": "2021-05-10T07:53:55Z",
            "updated_at": "2021-05-24T12:13:32Z",
            "due_on": null,
            "closed_at": null
        },
        {
            "number": 19,
            "title": "13th Sprint - Console team",
            "description": "",
            "open_issues": 29,
            "closed_issues": 32,
            "state": "open",
            "created_at": "2021-05-10T06:56:49Z",
            "updated_at": "2021-05-24T11:30:52Z",
            "due_on": "2021-05-23T07:00:00Z",
            "closed_at": null
        },
        {
            "number": 21,
            "title": "14th Sprint - Console team",
            "description": "",
            "open_issues": 31,
            "closed_issues": 0,
            "state": "open",
            "created_at": "2021-05-24T05:29:20Z",
            "updated_at": "2021-05-24T13:48:01Z",
            "due_on": "2021-06-06T07:00:00Z",
            "closed_at": null
        },
        {
            "number": 22,
            "title": "14th Sprint - Platform team",
            "description": "",
            "open_issues": 15,
            "closed_issues": 0,
            "state": "open",
            "created_at": "2021-05-24T08:16:56Z",
            "updated_at": "2021-05-24T13:20:19Z",
            "due_on": "2021-06-06T07:00:00Z",
            "closed_at": null
        }
    ]
    const foundMilestone = findMilestone(milestones, 'Platform');
    expect(foundMilestone.title).toBe('14th Sprint - Platform team')
})
