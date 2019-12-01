const state = {
    daySum: 7,
    selectedData: []
}

const getters = {}
for (const constantName in state) {
    if (state.hasOwnProperty(constantName)) {
        getters[constantName] = state => {
            return state[constantName];
        }
    }
}

const mutations = {
    'UPDATE'(state, {
        constant,
        value
    }) {
        state[constant] = value;
    },
}

const actions = {

}

export default {
    namespaced: true,
    state,
    getters,
    mutations,
    actions
}
